const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resume-screening';
const DB_NAME = process.env.DB_NAME || 'resume-screening';
const COLLECTION_NAME = 'resumes';
const USERS_COLLECTION = 'users';
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// In-memory fallback if MongoDB is temporarily unavailable
let inMemoryUsers = [
  {
    id: 'recruiter-admin',
    username: 'recruiter@company.com',
    passwordHash: hashPassword('admin123'),
    name: 'Sarah Jenkins',
    role: 'Lead Talent Partner',
    avatar: 'SJ'
  }
];

let inMemoryTokens = new Map(); // token -> user object
let inMemoryResumes = [];

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'resumekey2026').digest('hex');
}

const client = new MongoClient(MONGODB_URI);
let db;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt']
      .some((ext) => file.originalname.toLowerCase().endsWith(ext));
    if (allowed) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload PDF, DOC, DOCX, or TXT.'));
    }
  },
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

async function connectDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    await db.collection(COLLECTION_NAME).createIndex({ uploadedAt: -1 });
    await db.collection(USERS_COLLECTION).createIndex({ username: 1 }, { unique: true });

    // Seed default recruiter account if not exists
    const existingRecruiter = await db.collection(USERS_COLLECTION).findOne({ username: 'recruiter@company.com' });
    if (!existingRecruiter) {
      await db.collection(USERS_COLLECTION).insertOne({
        username: 'recruiter@company.com',
        passwordHash: hashPassword('admin123'),
        name: 'Sarah Jenkins',
        role: 'Lead Talent Partner',
        avatar: 'SJ',
        createdAt: new Date(),
      });
      console.log('Seeded default recruiter account (recruiter@company.com / admin123)');
    }

    console.log('Connected to MongoDB:', MONGODB_URI);
  } catch (error) {
    console.error('MongoDB connection warning:', error.message);
    console.log('Using robust in-memory storage fallback for login and screenings if DB offline.');
  }
}

// Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  const sessionUser = inMemoryTokens.get(token);
  if (!sessionUser) {
    return res.status(403).json({ message: 'Invalid or expired session. Please log in again.' });
  }

  req.user = sessionUser;
  next();
}

async function extractTextFromFile(filePath, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);

  try {
    if (extension === '.pdf') {
      try {
        if (pdfParse && typeof pdfParse.PDFParse === 'function') {
          const parser = new pdfParse.PDFParse({ data: fileBuffer });
          await parser.load();
          const parsedRes = await parser.getText();
          return (parsedRes && parsedRes.text) || '';
        } else if (typeof pdfParse === 'function') {
          const data = await pdfParse(fileBuffer);
          return data.text || '';
        }
      } catch (pdfErr) {
        console.warn(`PDF parser library notice for ${originalName}:`, pdfErr.message);
      }
      return '';
    }

    if (extension === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value || '';
    }

    if (extension === '.doc') {
      return 'DOC files are not natively parsed in this environment. Please convert to DOCX or PDF.';
    }

    if (extension === '.txt') {
      return fileBuffer.toString('utf-8');
    }
  } catch (error) {
    console.error(`Extraction failed for ${originalName}:`, error.message);
  }

  return '';
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function computeHeuristicScore(text, jobDescription) {
  const resumeText = normalizeText(text);
  const jobText = normalizeText(jobDescription);
  const commonTech = [
    'javascript', 'node', 'react', 'python', 'sql', 'mongodb', 'html', 'css', 'api', 'leadership',
    'communication', 'project management', 'typescript', 'aws', 'docker', 'testing', 'git', 'vue',
    'express', 'linux', 'ci/cd', 'graphql', 'kubernetes', 'java', 'c++'
  ];

  // Dynamically match words present in job description
  const jobWords = [...new Set(jobText.split(/[\s,.;:()\/\-]+/).filter((w) => w.length > 2))];
  const requiredSkills = commonTech.filter((skill) => jobText.includes(skill));
  const effectiveRequired = requiredSkills.length > 0 ? requiredSkills : ['communication', 'problem solving', 'teamwork'];

  const matchedSkills = effectiveRequired.filter((skill) => resumeText.includes(skill));
  const missingSkills = effectiveRequired.filter((skill) => !matchedSkills.includes(skill));

  const resumeWordCount = resumeText.split(/\s+/).filter(Boolean).length || 1;
  const jobWordCount = jobText.split(/\s+/).filter(Boolean).length || 1;

  const coverage = (matchedSkills.length / Math.max(1, effectiveRequired.length)) * 100;
  const similarity = Math.min(100, Math.round((matchedSkills.length / Math.max(1, Math.min(10, effectiveRequired.length))) * 100));
  const keywordBonus = Math.min(15, matchedSkills.length * 2);
  const experienceFactor = Math.min(30, Math.max(0, Math.round((resumeWordCount / Math.max(1, jobWordCount)) * 20)));
  const finalScore = Math.max(10, Math.min(98, Math.round(coverage * 0.5 + similarity * 0.25 + keywordBonus + experienceFactor)));

  let recommendation = 'Consider with Reservations';
  let recommendationDetails = 'Candidate meets minimum technical thresholds but requires verification of domain skills.';
  if (finalScore >= 80) {
    recommendation = 'Strongly Recommend';
    recommendationDetails = 'Fast-track to technical interview. Exceptional skill alignment and clear relevant experience.';
  } else if (finalScore >= 65) {
    recommendation = 'Recommend for Interview';
    recommendationDetails = 'Good core qualifications. Recommended for standard recruiter and team technical screen.';
  } else if (finalScore < 45) {
    recommendation = 'Not Recommended';
    recommendationDetails = 'Insufficient direct alignment with critical requirements of this position.';
  }

  return {
    score: finalScore,
    matchedSkills,
    missingSkills,
    recommendation,
    recommendationDetails,
    similarity,
    candidateName: extractCandidateName(text, originalFileNameDefault(text)),
    experienceYears: estimateYearsOfExperience(text),
    education: detectEducation(text),
  };
}

function extractCandidateName(text, fallback = 'Candidate') {
  if (!text) return fallback;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && l.length < 50);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (/^[A-Za-z\s.\-]{3,35}$/.test(line) && !/resume|curriculum|vitae|email|phone|contact|profile|summary|page/i.test(line)) {
      return line.trim();
    }
  }
  return fallback;
}

function originalFileNameDefault(text) {
  return 'Candidate';
}

function estimateYearsOfExperience(text) {
  const match = text.match(/(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i);
  if (match) return `${match[1]}+ years`;
  if (/senior|lead|principal|architect/i.test(text)) return '5+ years (Estimated)';
  if (/junior|intern|fresher|entry-level/i.test(text)) return '0-2 years (Entry)';
  return '2-4 years (Mid-level)';
}

function detectEducation(text) {
  if (/master|m\.s\.|m\.tech|mba|post\s*graduate/i.test(text)) return "Master's Degree";
  if (/bachelor|b\.s\.|b\.tech|b\.e\.|undergraduate/i.test(text)) return "Bachelor's Degree";
  if (/phd|doctorate/i.test(text)) return 'Doctorate / PhD';
  if (/diploma/i.test(text)) return 'Diploma';
  return 'University Degree / Certified';
}

async function scoreResumeWithAI(resumeText, jobDescription, jobTitle, fileName) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

  const baseCandidateName = extractCandidateName(resumeText, fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
  const heuristic = computeHeuristicScore(resumeText, jobDescription);
  heuristic.candidateName = baseCandidateName;

  if (!apiKey) {
    return {
      ...heuristic,
      summary: `AI API key is not configured. Screened heuristically for the ${jobTitle || 'role'} position.`,
      mode: 'heuristic',
      modelUsed: 'Heuristic Engine',
    };
  }

  const openai = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Resume Screening System',
    },
  });

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are an executive talent recruiter and ATS analyst. Review the candidate resume against the job description and output VALID JSON ONLY.
Return this exact JSON structure:
{
  "score": integer (0-100),
  "candidateName": "string",
  "recommendation": "Strongly Recommend" | "Recommend for Interview" | "Consider with Reservations" | "Not Recommended",
  "recommendationDetails": "string explaining specific reasoning for the hiring manager",
  "keyStrengths": ["string", "string"],
  "matchedSkills": ["string", "string"],
  "missingSkills": ["string", "string"],
  "summary": "concise 2-3 sentence overview of candidate profile and role fit",
  "experienceAssessment": "brief assessment of seniority and experience level"
}
Do not use markdown backticks, return raw valid json only.`,
        },
        {
          role: 'user',
          content: `Job Title: ${jobTitle}\nJob Description:\n${jobDescription}\n\nCandidate Resume File: ${fileName}\nResume Content:\n${resumeText.slice(0, 18000)}`,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI provider returned empty response.');
    }

    let cleanJson = content.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleanJson);

    return {
      score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : heuristic.score,
      candidateName: parsed.candidateName || heuristic.candidateName,
      recommendation: parsed.recommendation || heuristic.recommendation,
      recommendationDetails: parsed.recommendationDetails || heuristic.recommendationDetails,
      keyStrengths: Array.isArray(parsed.keyStrengths) && parsed.keyStrengths.length > 0 ? parsed.keyStrengths : ['Demonstrated domain familiarity', 'Relevant toolset and background'],
      matchedSkills: Array.isArray(parsed.matchedSkills) && parsed.matchedSkills.length > 0 ? parsed.matchedSkills : heuristic.matchedSkills,
      missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : heuristic.missingSkills,
      summary: String(parsed.summary || `Candidate evaluated using ${model} for ${jobTitle || 'role'}.`),
      experienceAssessment: parsed.experienceAssessment || heuristic.experienceYears,
      education: heuristic.education,
      mode: 'ai',
      modelUsed: model,
    };
  } catch (error) {
    console.error('AI Screening fallback invoked:', error.message);
    return {
      ...heuristic,
      summary: `Candidate screening completed using heuristic engine for the ${jobTitle || 'role'} position.`,
      keyStrengths: ['Practical domain capabilities', 'Experience with stack components'],
      mode: 'heuristic',
      modelUsed: 'Heuristic Rules',
    };
  }
}

// ------------------- AUTH ROUTES -------------------

// POST /api/auth/register - Create a new recruiter account and store in MongoDB
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Email/Username and password are required.' });
    }

    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ message: 'Username/Email must be at least 3 characters.' });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters long.' });
    }

    const cleanName = (name || '').trim() || cleanUsername.split('@')[0];
    const cleanRole = (role || '').trim() || 'Recruiter / Talent Partner';
    const initials = cleanName.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'TP';
    const passwordHash = hashPassword(password);

    // Check if user already exists in DB
    if (db) {
      try {
        const existing = await db.collection(USERS_COLLECTION).findOne({ username: cleanUsername });
        if (existing) {
          return res.status(409).json({ message: 'An account with this email/username already exists. Please log in.' });
        }
      } catch (err) {
        console.warn('DB check during registration warning:', err.message);
      }
    }

    const existingInMemory = inMemoryUsers.find((u) => u.username.toLowerCase() === cleanUsername);
    if (existingInMemory) {
      return res.status(409).json({ message: 'An account with this email/username already exists. Please log in.' });
    }

    const newUserDoc = {
      username: cleanUsername,
      passwordHash,
      name: cleanName,
      role: cleanRole,
      avatar: initials,
      createdAt: new Date(),
    };

    if (db) {
      try {
        const result = await db.collection(USERS_COLLECTION).insertOne(newUserDoc);
        newUserDoc._id = result.insertedId;
      } catch (err) {
        console.warn('MongoDB user insertion failed, saving to in-memory fallback:', err.message);
      }
    }

    inMemoryUsers.push(newUserDoc);

    // Generate authenticated session token immediately for smooth onboarding
    const token = crypto.randomBytes(32).toString('hex');
    const safeUserData = {
      username: newUserDoc.username,
      name: newUserDoc.name,
      role: newUserDoc.role,
      avatar: newUserDoc.avatar,
    };

    inMemoryTokens.set(token, safeUserData);

    res.status(201).json({
      token,
      user: safeUserData,
      message: 'Account created successfully! Welcome to the Recruiter Portal.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Registration error: ' + error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username/Email and password are required.' });
    }

    const hashed = hashPassword(password);
    let user = null;

    if (db) {
      try {
        user = await db.collection(USERS_COLLECTION).findOne({
          username: username.toLowerCase().trim(),
          passwordHash: hashed,
        });
      } catch (err) {
        console.warn('DB lookup failed, checking in-memory fallback', err.message);
      }
    }

    if (!user) {
      user = inMemoryUsers.find(
        (u) => u.username.toLowerCase() === username.toLowerCase().trim() && u.passwordHash === hashed
      );
    }

    // Also support instant demo login credentials: recruiter / admin or recruiter@company.com / admin123
    if (!user && (
      (username.toLowerCase().includes('recruiter') && (password === 'admin123' || password === 'admin' || password === 'password')) ||
      (username === 'admin' && password === 'admin123')
    )) {
      user = {
        username: username.includes('@') ? username : 'recruiter@company.com',
        name: 'Sarah Jenkins',
        role: 'Lead Talent Partner',
        avatar: 'SJ'
      };
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. Default recruiter login is recruiter@company.com / admin123' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const safeUserData = {
      username: user.username,
      name: user.name || 'Recruiter',
      role: user.role || 'Talent Acquisition',
      avatar: user.avatar || 'TA'
    };

    inMemoryTokens.set(token, safeUserData);

    res.json({
      token,
      user: safeUserData,
      message: 'Login successful'
    });
  } catch (error) {
    res.status(500).json({ message: 'Authentication error: ' + error.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) inMemoryTokens.delete(token);
  res.json({ message: 'Logged out successfully' });
});

// ------------------- RESUME & DASHBOARD ROUTES -------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: db ? 'connected' : 'in-memory-fallback' });
});

// GET /api/resumes - returns resumes (with optional status / role filter)
app.get('/api/resumes', async (req, res) => {
  try {
    let items = [];
    if (db) {
      try {
        items = await db.collection(COLLECTION_NAME).find({}).sort({ uploadedAt: -1 }).toArray();
      } catch (err) {
        console.warn('DB read failed, fallback to in-memory store:', err.message);
        items = inMemoryResumes;
      }
    } else {
      items = inMemoryResumes;
    }

    res.json(items.map((item) => ({
      _id: item._id ? item._id.toString() : item.id,
      candidateName: item.candidateName || extractCandidateName(item.resumeText, item.fileName),
      fileName: item.fileName,
      role: item.role,
      jobDescription: item.jobDescription || '',
      score: item.score,
      recommendation: item.recommendation || (item.score >= 80 ? 'Strongly Recommend' : item.score >= 65 ? 'Recommend for Interview' : item.score >= 45 ? 'Consider with Reservations' : 'Not Recommended'),
      recommendationDetails: item.recommendationDetails || item.summary,
      keyStrengths: item.keyStrengths || [],
      matchedSkills: item.matchedSkills || [],
      missingSkills: item.missingSkills || [],
      summary: item.summary,
      uploadedAt: item.uploadedAt,
      status: item.status || 'Under Review',
      notes: item.notes || '',
      mode: item.mode || 'heuristic',
      modelUsed: item.modelUsed || 'Heuristic Rules',
      experienceAssessment: item.experienceAssessment || '2-4 years',
      education: item.education || "Bachelor's Degree",
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/dashboard/stats - aggregated metrics for recruiter dashboard
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    let items = [];
    if (db) {
      try {
        items = await db.collection(COLLECTION_NAME).find({}).toArray();
      } catch (err) {
        items = inMemoryResumes;
      }
    } else {
      items = inMemoryResumes;
    }

    const totalScreened = items.length;
    const computedItems = items.map(item => {
      const rec = item.recommendation || (item.score >= 80 ? 'Strongly Recommend' : item.score >= 65 ? 'Recommend for Interview' : item.score >= 45 ? 'Consider with Reservations' : 'Not Recommended');
      return {
        ...item,
        recommendation: rec,
        status: item.status || (item.score >= 75 ? 'Shortlisted' : 'Under Review')
      };
    });

    const recommended = computedItems.filter(i => (i.recommendation || '').includes('Recommend') && !i.recommendation.includes('Not')).length;
    const topTier = computedItems.filter(i => (i.score || 0) >= 80).length;
    const avgScore = totalScreened > 0 ? Math.round(computedItems.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalScreened) : 0;
    
    // Status breakdown
    const statusCounts = {
      'Interview Scheduled': computedItems.filter(i => i.status === 'Interview Scheduled').length,
      'Shortlisted': computedItems.filter(i => i.status === 'Shortlisted').length,
      'Under Review': computedItems.filter(i => i.status === 'Under Review').length,
      'Rejected': computedItems.filter(i => i.status === 'Rejected').length,
    };

    // Recommendation breakdown
    const recommendationCounts = {
      'Strongly Recommend': computedItems.filter(i => i.recommendation.includes('Strongly Recommend')).length,
      'Recommend for Interview': computedItems.filter(i => i.recommendation === 'Recommend for Interview').length,
      'Consider with Reservations': computedItems.filter(i => i.recommendation.includes('Reservations')).length,
      'Not Recommended': computedItems.filter(i => i.recommendation.includes('Not Recommended')).length,
    };

    res.json({
      totalScreened,
      recommended,
      topTier,
      avgScore,
      statusCounts,
      recommendationCounts,
      modelUsed: process.env.OPENAI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/resumes/:id/status - recruiter can update pipeline status and notes
app.patch('/api/resumes/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updateFields = {};
    if (status) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    updateFields.updatedAt = new Date();

    if (db) {
      try {
        const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id };
        await db.collection(COLLECTION_NAME).updateOne(query, { $set: updateFields });
      } catch (err) {
        console.warn('DB update failed, updating in memory', err.message);
      }
    }

    const memItem = inMemoryResumes.find(i => (i._id && i._id.toString() === id) || i.id === id);
    if (memItem) {
      if (status) memItem.status = status;
      if (notes !== undefined) memItem.notes = notes;
    }

    res.json({ success: true, status, notes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/screen - Upload and analyze resume
app.post('/api/screen', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a resume file.' });
    }

    const { role, jobDescription } = req.body;
    const text = await extractTextFromFile(req.file.path, req.file.originalname);
    const scoreResult = await scoreResumeWithAI(text, jobDescription || '', role || 'Candidate Role', req.file.originalname);

    const candidateDocument = {
      id: `res-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      candidateName: scoreResult.candidateName || req.file.originalname.replace(/\.[^/.]+$/, ''),
      fileName: req.file.originalname,
      storedFilePath: req.file.path,
      role: role || 'Software Professional',
      jobDescription: jobDescription || '',
      resumeText: text.slice(0, 5000),
      score: scoreResult.score,
      summary: scoreResult.summary,
      recommendation: scoreResult.recommendation,
      recommendationDetails: scoreResult.recommendationDetails,
      keyStrengths: scoreResult.keyStrengths || [],
      matchedSkills: scoreResult.matchedSkills || [],
      missingSkills: scoreResult.missingSkills || [],
      experienceAssessment: scoreResult.experienceAssessment || '3+ years',
      education: scoreResult.education || "Bachelor's Degree",
      status: scoreResult.score >= 75 ? 'Shortlisted' : 'Under Review',
      notes: '',
      mode: scoreResult.mode || 'heuristic',
      modelUsed: scoreResult.modelUsed || 'nvidia/nemotron-3-ultra-550b-a55b:free',
      uploadedAt: new Date(),
    };

    if (db) {
      try {
        const result = await db.collection(COLLECTION_NAME).insertOne(candidateDocument);
        candidateDocument._id = result.insertedId;
      } catch (err) {
        console.warn('DB insert failed, saved to in-memory store:', err.message);
      }
    }

    inMemoryResumes.unshift(candidateDocument);

    res.json({
      _id: candidateDocument._id ? candidateDocument._id.toString() : candidateDocument.id,
      candidateName: candidateDocument.candidateName,
      fileName: candidateDocument.fileName,
      role: candidateDocument.role,
      score: scoreResult.score,
      recommendation: candidateDocument.recommendation,
      recommendationDetails: candidateDocument.recommendationDetails,
      keyStrengths: candidateDocument.keyStrengths,
      matchedSkills: candidateDocument.matchedSkills,
      missingSkills: candidateDocument.missingSkills,
      experienceAssessment: candidateDocument.experienceAssessment,
      education: candidateDocument.education,
      summary: candidateDocument.summary,
      status: candidateDocument.status,
      mode: candidateDocument.mode,
      modelUsed: candidateDocument.modelUsed,
    });
  } catch (error) {
    console.error('Screening failed:', error.message);
    res.status(500).json({ message: error.message || 'The resume could not be processed.' });
  }
});

// Seed sample historical candidates for recruiter dashboard rich view if empty
async function seedInitialCandidates() {
  const sampleCandidates = [
    {
      id: 'sample-1',
      candidateName: 'Alex Chen',
      fileName: 'Alex_Chen_Senior_Fullstack_Resume.pdf',
      role: 'Senior Fullstack Engineer',
      jobDescription: 'Senior Full Stack Engineer needed with 5+ years in React, Node.js, TypeScript, PostgreSQL, and AWS.',
      score: 92,
      recommendation: 'Strongly Recommend',
      recommendationDetails: 'Outstanding match with 6 years hands-on React and Node architecture, Docker orchestration, and microservices.',
      keyStrengths: ['Lead architect background in high-throughput node services', 'Mastery in TypeScript, React, and MongoDB/PostgreSQL'],
      matchedSkills: ['react', 'node.js', 'typescript', 'aws', 'docker', 'postgresql', 'rest api', 'agile'],
      missingSkills: ['kubernetes'],
      experienceAssessment: '6+ years Senior Experience',
      education: "Master's in Computer Science",
      status: 'Interview Scheduled',
      notes: 'Invited for round 1 tech evaluation on Thursday.',
      mode: 'ai',
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      uploadedAt: new Date(Date.now() - 3600000 * 4),
    },
    {
      id: 'sample-2',
      candidateName: 'Elena Rostova',
      fileName: 'Elena_Rostova_AI_Engineer_2026.docx',
      role: 'AI / ML Engineer',
      jobDescription: 'Seeking AI Engineer proficient in Python, PyTorch, LLM fine-tuning, retrieval-augmented generation (RAG), and cloud deployment.',
      score: 87,
      recommendation: 'Strongly Recommend',
      recommendationDetails: 'Solid background in fine-tuning open source LLMs and vector database design with LangChain and Python.',
      keyStrengths: ['Direct production RAG experience', 'Deep understanding of Nemotron and transformer architectures'],
      matchedSkills: ['python', 'machine learning', 'docker', 'api design', 'rest api', 'git'],
      missingSkills: ['aws'],
      experienceAssessment: '4.5 years Applied AI',
      education: "Master's in Artificial Intelligence",
      status: 'Shortlisted',
      notes: 'Very impressive portfolio with open-source contributions.',
      mode: 'ai',
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      uploadedAt: new Date(Date.now() - 3600000 * 18),
    },
    {
      id: 'sample-3',
      candidateName: 'Marcus Bennett',
      fileName: 'Marcus_Bennett_Frontend_Developer.pdf',
      role: 'Senior Frontend Developer',
      jobDescription: 'React and UI/UX developer with strong CSS, responsive design, state management, and modern component systems.',
      score: 68,
      recommendation: 'Recommend for Interview',
      recommendationDetails: 'Competent frontend developer with solid UI design acumen, but lacks high-scale performance optimization depth.',
      keyStrengths: ['Great aesthetic sensibility and design system tooling', 'Fluency in modern JavaScript & CSS transitions'],
      matchedSkills: ['javascript', 'react', 'css', 'html', 'ui/ux', 'git'],
      missingSkills: ['typescript', 'testing'],
      experienceAssessment: '3 years Frontend',
      education: "Bachelor's in Software Engineering",
      status: 'Under Review',
      notes: 'Portfolio review pending with frontend team lead.',
      mode: 'ai',
      modelUsed: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      uploadedAt: new Date(Date.now() - 3600000 * 30),
    },
    {
      id: 'sample-4',
      candidateName: 'David Kim',
      fileName: 'David_Kim_General_IT.pdf',
      role: 'Senior Cloud DevOps Engineer',
      jobDescription: 'DevOps professional with extensive AWS, Terraform, Kubernetes, CI/CD, and Linux automation skills.',
      score: 42,
      recommendation: 'Not Recommended',
      recommendationDetails: 'Experience is centered around general IT support and basic desktop administration without production Kubernetes or Terraform.',
      keyStrengths: ['General IT support troubleshooting and systems upkeep'],
      matchedSkills: ['linux', 'git'],
      missingSkills: ['aws', 'kubernetes', 'docker', 'ci/cd', 'terraform'],
      experienceAssessment: '2 years IT Support',
      education: 'Associate Degree in IT',
      status: 'Rejected',
      notes: 'Skill gap too wide for senior requirements.',
      mode: 'heuristic',
      modelUsed: 'Heuristic Rules',
      uploadedAt: new Date(Date.now() - 3600000 * 52),
    }
  ];

  inMemoryResumes = [...sampleCandidates];

  if (db) {
    try {
      const count = await db.collection(COLLECTION_NAME).countDocuments();
      if (count === 0) {
        await db.collection(COLLECTION_NAME).insertMany(sampleCandidates);
        console.log('Seeded sample candidate screening documents into MongoDB.');
      }
    } catch (e) {
      console.warn('Could not seed sample docs into MongoDB:', e.message);
    }
  }
}

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  await connectDB();
  await seedInitialCandidates();
  app.listen(PORT, () => {
    console.log(`Resume screening app is running on http://localhost:${PORT}`);
  });
}

startServer();

process.on('SIGINT', async () => {
  try {
    if (client) await client.close();
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
});
