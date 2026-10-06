// State management
let currentToken = localStorage.getItem('talentpulse_token') || null;
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem('talentpulse_user') || 'null');
} catch (e) {
  currentUser = null;
}

let allCandidates = [];
let selectedCandidate = null;

// DOM Elements - Navigation & Auth
const navScreenTab = document.getElementById('navScreenTab');
const navDashboardTab = document.getElementById('navDashboardTab');
const screenView = document.getElementById('screenView');
const dashboardView = document.getElementById('dashboardView');
const recBadge = document.getElementById('recBadge');

const loggedOutSection = document.getElementById('loggedOutSection');
const loggedInSection = document.getElementById('loggedInSection');
const openLoginBtn = document.getElementById('openLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userAvatar = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const userRoleDisplay = document.getElementById('userRoleDisplay');

// DOM Elements - Auth Modal (Login & Registration)
const loginModal = document.getElementById('loginModal');
const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
const authModalTitle = document.getElementById('authModalTitle');
const authModalEyebrow = document.getElementById('authModalEyebrow');
const tabSignIn = document.getElementById('tabSignIn');
const tabCreateAccount = document.getElementById('tabCreateAccount');
const switchToRegisterLink = document.getElementById('switchToRegisterLink');
const switchToLoginLink = document.getElementById('switchToLoginLink');

const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const fillDemoCredsBtn = document.getElementById('fillDemoCredsBtn');

const registerForm = document.getElementById('registerForm');
const regName = document.getElementById('regName');
const regUsername = document.getElementById('regUsername');
const regRole = document.getElementById('regRole');
const regPassword = document.getElementById('regPassword');
const registerErrorMsg = document.getElementById('registerErrorMsg');
const registerSuccessMsg = document.getElementById('registerSuccessMsg');

// DOM Elements - Screening Form & Results
const resumeForm = document.getElementById('resumeForm');
const quickFillBtn = document.getElementById('quickFillBtn');
const roleInput = document.getElementById('role');
const jobDescriptionInput = document.getElementById('jobDescription');
const resumeFileInput = document.getElementById('resume');
const dropZone = document.getElementById('dropZone');
const fileSelectedName = document.getElementById('fileSelectedName');
const submitBtn = document.getElementById('submitBtn');

const resultCard = document.getElementById('resultCard');
const resultCandidateName = document.getElementById('resultCandidateName');
const scoreValue = document.getElementById('scoreValue');
const recommendationBadge = document.getElementById('recommendationBadge');
const recommendationDetailsText = document.getElementById('recommendationDetailsText');
const modeBadge = document.getElementById('modeBadge');
const resultExp = document.getElementById('resultExp');
const resultEdu = document.getElementById('resultEdu');
const resultStatus = document.getElementById('resultStatus');
const summaryText = document.getElementById('summaryText');
const matchedSkillsContainer = document.getElementById('matchedSkills');
const missingSkillsContainer = document.getElementById('missingSkills');
const viewInDashboardBtn = document.getElementById('viewInDashboardBtn');
const historyList = document.getElementById('historyList');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

// DOM Elements - Dashboard
const statTotalScreened = document.getElementById('statTotalScreened');
const statRecommended = document.getElementById('statRecommended');
const statTopTier = document.getElementById('statTopTier');
const statAvgScore = document.getElementById('statAvgScore');
const filterRecommendation = document.getElementById('filterRecommendation');
const filterStatus = document.getElementById('filterStatus');
const searchCandidates = document.getElementById('searchCandidates');
const candidateTableBody = document.getElementById('candidateTableBody');
const emptyTableNotice = document.getElementById('emptyTableNotice');

// DOM Elements - Candidate Detail Modal
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCandidateName = document.getElementById('modalCandidateName');
const modalRole = document.getElementById('modalRole');
const modalScore = document.getElementById('modalScore');
const modalRecommendationBadge = document.getElementById('modalRecommendationBadge');
const modalRecommendationDetails = document.getElementById('modalRecommendationDetails');
const modalSummary = document.getElementById('modalSummary');
const modalFileName = document.getElementById('modalFileName');
const modalExp = document.getElementById('modalExp');
const modalEdu = document.getElementById('modalEdu');
const modalModel = document.getElementById('modalModel');
const modalMatchedSkills = document.getElementById('modalMatchedSkills');
const modalMissingSkills = document.getElementById('modalMissingSkills');
const modalMatchedCount = document.getElementById('modalMatchedCount');
const modalMissingCount = document.getElementById('modalMissingCount');
const modalStageSelect = document.getElementById('modalStageSelect');
const modalNotesInput = document.getElementById('modalNotesInput');
const saveStageBtn = document.getElementById('saveStageBtn');

// ----------------------------------------------------
// UI TABS & NAVIGATION
// ----------------------------------------------------
function switchView(target) {
  if (target === 'dashboard') {
    navDashboardTab.classList.add('active');
    navScreenTab.classList.remove('active');
    dashboardView.classList.remove('hidden');
    screenView.classList.add('hidden');
    loadDashboard();
  } else {
    navScreenTab.classList.add('active');
    navDashboardTab.classList.remove('active');
    screenView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
  }
}

navScreenTab.addEventListener('click', () => switchView('screen'));
navDashboardTab.addEventListener('click', () => switchView('dashboard'));
viewInDashboardBtn.addEventListener('click', () => switchView('dashboard'));

// ----------------------------------------------------
// AUTHENTICATION LOGIC
// ----------------------------------------------------
function updateAuthUI() {
  if (currentUser && currentToken) {
    loggedOutSection.classList.add('hidden');
    loggedInSection.classList.remove('hidden');
    userAvatar.textContent = currentUser.avatar || 'TA';
    userNameDisplay.textContent = currentUser.name || 'Recruiter';
    userRoleDisplay.textContent = currentUser.role || 'Talent Partner';
  } else {
    loggedOutSection.classList.remove('hidden');
    loggedInSection.classList.add('hidden');
  }
}

function showSignInTab() {
  tabSignIn.classList.add('active');
  tabCreateAccount.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  authModalTitle.textContent = 'Sign In to Recruiter Portal';
  authModalEyebrow.textContent = 'Recruiter Access';
  loginErrorMsg.classList.add('hidden');
}

function showRegisterTab() {
  tabCreateAccount.classList.add('active');
  tabSignIn.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  authModalTitle.textContent = 'Create Recruiter Account';
  authModalEyebrow.textContent = 'Join Hiring Team';
  registerErrorMsg.classList.add('hidden');
  registerSuccessMsg.classList.add('hidden');
}

tabSignIn.addEventListener('click', showSignInTab);
tabCreateAccount.addEventListener('click', showRegisterTab);
switchToRegisterLink.addEventListener('click', showRegisterTab);
switchToLoginLink.addEventListener('click', showSignInTab);

openLoginBtn.addEventListener('click', () => {
  loginErrorMsg.classList.add('hidden');
  registerErrorMsg.classList.add('hidden');
  registerSuccessMsg.classList.add('hidden');
  showSignInTab();
  loginModal.classList.remove('hidden');
});

closeLoginModalBtn.addEventListener('click', () => {
  loginModal.classList.add('hidden');
});

loginModal.addEventListener('click', (e) => {
  if (e.target === loginModal) loginModal.classList.add('hidden');
});

fillDemoCredsBtn.addEventListener('click', () => {
  loginUsername.value = 'recruiter@company.com';
  loginPassword.value = 'admin123';
});

// Login Form Submit Handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.classList.add('hidden');
  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername.value,
        password: loginPassword.value,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed.');
    }

    currentToken = data.token;
    currentUser = data.user;
    localStorage.setItem('talentpulse_token', currentToken);
    localStorage.setItem('talentpulse_user', JSON.stringify(currentUser));

    updateAuthUI();
    loginModal.classList.add('hidden');
    loginForm.reset();
  } catch (err) {
    loginErrorMsg.textContent = err.message;
    loginErrorMsg.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
});

// Registration Form Submit Handler
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerErrorMsg.classList.add('hidden');
  registerSuccessMsg.classList.add('hidden');

  const nameVal = regName.value.trim();
  const usernameVal = regUsername.value.trim();
  const roleVal = regRole.value.trim();
  const passwordVal = regPassword.value;

  if (passwordVal.length < 4) {
    registerErrorMsg.textContent = 'Password must be at least 4 characters.';
    registerErrorMsg.classList.remove('hidden');
    return;
  }

  const submitBtn = document.getElementById('registerSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameVal,
        username: usernameVal,
        role: roleVal,
        password: passwordVal,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Registration failed.');
    }

    registerSuccessMsg.textContent = data.message || 'Account created successfully! Logging you in...';
    registerSuccessMsg.classList.remove('hidden');

    currentToken = data.token;
    currentUser = data.user;
    localStorage.setItem('talentpulse_token', currentToken);
    localStorage.setItem('talentpulse_user', JSON.stringify(currentUser));

    setTimeout(() => {
      updateAuthUI();
      loginModal.classList.add('hidden');
      registerForm.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Recruiter Account';
    }, 900);
  } catch (err) {
    registerErrorMsg.textContent = err.message;
    registerErrorMsg.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Recruiter Account';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (currentToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
    } catch (e) {
      console.warn('Logout notification failed');
    }
  }

  currentToken = null;
  currentUser = null;
  localStorage.removeItem('talentpulse_token');
  localStorage.removeItem('talentpulse_user');
  updateAuthUI();
});

// ----------------------------------------------------
// DROP ZONE & QUICK FILL
// ----------------------------------------------------
resumeFileInput.addEventListener('change', () => {
  if (resumeFileInput.files && resumeFileInput.files[0]) {
    fileSelectedName.textContent = `Selected: ${resumeFileInput.files[0].name}`;
    fileSelectedName.classList.remove('hidden');
  } else {
    fileSelectedName.classList.add('hidden');
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    resumeFileInput.files = e.dataTransfer.files;
    fileSelectedName.textContent = `Selected: ${e.dataTransfer.files[0].name}`;
    fileSelectedName.classList.remove('hidden');
  }
});

quickFillBtn.addEventListener('click', () => {
  roleInput.value = 'Senior Full Stack AI Engineer';
  jobDescriptionInput.value = `We are seeking an experienced Full Stack AI Engineer to drive the design and deployment of LLM-powered applications.

Key Qualifications & Responsibilities:
- 4+ years building production applications using Node.js, Express, React, TypeScript, and Python.
- Proven experience integrating Large Language Models (LLMs, OpenAI API, Nemotron, or open source weights) with prompt engineering and RAG.
- Solid background with MongoDB, PostgreSQL, RESTful APIs, and cloud deployments (AWS, Docker).
- Strong communication, proactive problem-solving, and cross-functional team leadership.`;
});

// ----------------------------------------------------
// RECOMMENDATION BADGE FORMATTER
// ----------------------------------------------------
function formatRecommendationBadge(rec) {
  const text = rec || 'Consider with Reservations';
  let cssClass = 'rec-consider';
  let icon = '⚠️';

  if (text.includes('Strongly')) {
    cssClass = 'rec-strongly';
    icon = '⭐';
  } else if (text.includes('Interview') || text === 'Recommend for Interview') {
    cssClass = 'rec-recommend';
    icon = '✅';
  } else if (text.includes('Not')) {
    cssClass = 'rec-not';
    icon = '❌';
  }

  return { text, cssClass, icon };
}

function renderSkillsList(container, skills, isMissing = false) {
  container.innerHTML = '';
  if (!skills || skills.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.className = `skill-tag ${isMissing ? 'missing' : ''}`;
    emptySpan.textContent = isMissing ? 'None identified' : 'Standard alignment';
    container.appendChild(emptySpan);
    return;
  }

  skills.forEach((skill) => {
    const tag = document.createElement('span');
    tag.className = `skill-tag ${isMissing ? 'missing' : ''}`;
    tag.textContent = skill;
    container.appendChild(tag);
  });
}

// ----------------------------------------------------
// SCREENING SUBMISSION
// ----------------------------------------------------
resumeForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!resumeFileInput.files || !resumeFileInput.files[0]) {
    alert('Please choose or drop a resume file to screen.');
    return;
  }

  const formData = new FormData(resumeForm);
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');

  submitBtn.disabled = true;
  btnText.textContent = 'Screening with Nemotron AI...';
  btnSpinner.classList.remove('hidden');

  try {
    const res = await fetch('/api/screen', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Screening request failed.');
    }

    displayScreeningResult(data);
    await loadRecentScreenings();
  } catch (error) {
    alert(error.message || 'Failed to screen resume.');
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = 'Analyze Candidate with AI';
    btnSpinner.classList.add('hidden');
  }
});

function displayScreeningResult(data) {
  resultCard.classList.remove('hidden');
  resultCandidateName.textContent = data.candidateName || data.fileName || 'Candidate Evaluation';
  scoreValue.textContent = `${data.score}%`;

  const badgeInfo = formatRecommendationBadge(data.recommendation);
  recommendationBadge.textContent = `${badgeInfo.icon} ${badgeInfo.text}`;
  recommendationBadge.className = `rec-badge ${badgeInfo.cssClass}`;

  recommendationDetailsText.textContent = data.recommendationDetails || data.summary || 'Candidate analyzed against role requirements.';
  modeBadge.textContent = data.mode === 'ai' ? 'Nemotron-3' : 'Heuristic Rules';

  resultExp.textContent = data.experienceAssessment || '3+ years';
  resultEdu.textContent = data.education || "Bachelor's Degree";
  resultStatus.textContent = data.status || 'Under Review';

  summaryText.textContent = data.summary || '';

  renderSkillsList(matchedSkillsContainer, data.matchedSkills || []);
  renderSkillsList(missingSkillsContainer, data.missingSkills || [], true);

  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ----------------------------------------------------
// HISTORY SIDEBAR
// ----------------------------------------------------
async function loadRecentScreenings() {
  try {
    const res = await fetch('/api/resumes');
    const items = await res.json();
    allCandidates = items;
    recBadge.textContent = items.length;

    renderHistorySidebar(items.slice(0, 10));
  } catch (err) {
    console.error('Failed to fetch resumes:', err);
  }
}

refreshHistoryBtn.addEventListener('click', loadRecentScreenings);

function renderHistorySidebar(items) {
  historyList.innerHTML = '';
  if (!items || items.length === 0) {
    historyList.innerHTML = '<p class="panel-subtitle">No candidate screenings recorded yet.</p>';
    return;
  }

  items.forEach((item) => {
    const badge = formatRecommendationBadge(item.recommendation);
    const card = document.createElement('article');
    card.className = 'history-item';
    card.innerHTML = `
      <div class="history-header">
        <h3 class="history-name">${escapeHtml(item.candidateName || item.fileName)}</h3>
        <span class="history-score-badge">${item.score}%</span>
      </div>
      <p class="history-role">${escapeHtml(item.role || 'General Role')}</p>
      <div class="history-footer">
        <span class="badge-mini ${badge.cssClass}">${badge.icon} ${badge.text}</span>
        <span class="stage-pill ${stageClass(item.status)}">${escapeHtml(item.status || 'Review')}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      openCandidateModal(item);
    });

    historyList.appendChild(card);
  });
}

function stageClass(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s.includes('interview')) return 'interview-scheduled';
  if (s.includes('shortlist')) return 'shortlisted';
  if (s.includes('reject')) return 'rejected';
  return '';
}

// ----------------------------------------------------
// RECRUITER DASHBOARD METRICS & TABLE
// ----------------------------------------------------
async function loadDashboard() {
  try {
    const [statsRes, resumesRes] = await Promise.all([
      fetch('/api/dashboard/stats'),
      fetch('/api/resumes'),
    ]);

    const stats = await statsRes.json();
    const resumes = await resumesRes.json();
    allCandidates = resumes;

    // Update KPI counters
    statTotalScreened.textContent = stats.totalScreened || resumes.length || 0;
    statRecommended.textContent = stats.recommended || 0;
    statTopTier.textContent = stats.topTier || 0;
    statAvgScore.textContent = `${stats.avgScore || 0}%`;

    applyDashboardFilters();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function applyDashboardFilters() {
  const recFilter = filterRecommendation.value;
  const statusFilter = filterStatus.value;
  const search = searchCandidates.value.trim().toLowerCase();

  const filtered = allCandidates.filter((c) => {
    // Recommendation filter
    if (recFilter !== 'ALL') {
      if (!c.recommendation || !c.recommendation.toLowerCase().includes(recFilter.toLowerCase())) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      if (c.status !== statusFilter) return false;
    }

    // Search query
    if (search) {
      const matchName = (c.candidateName || '').toLowerCase().includes(search);
      const matchRole = (c.role || '').toLowerCase().includes(search);
      const matchSkills = (c.matchedSkills || []).some((s) => s.toLowerCase().includes(search));
      if (!matchName && !matchRole && !matchSkills) return false;
    }

    return true;
  });

  renderCandidatesTable(filtered);
}

filterRecommendation.addEventListener('change', applyDashboardFilters);
filterStatus.addEventListener('change', applyDashboardFilters);
searchCandidates.addEventListener('input', applyDashboardFilters);

function renderCandidatesTable(candidates) {
  candidateTableBody.innerHTML = '';

  if (candidates.length === 0) {
    emptyTableNotice.classList.remove('hidden');
    return;
  }
  emptyTableNotice.classList.add('hidden');

  candidates.forEach((cand) => {
    const badge = formatRecommendationBadge(cand.recommendation);
    const tr = document.createElement('tr');

    const topSkills = (cand.matchedSkills || []).slice(0, 3).map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join(' ') || '<span class="file-limits">No specific tags</span>';

    tr.innerHTML = `
      <td>
        <span class="c-name">${escapeHtml(cand.candidateName || 'Candidate')}</span>
        <span class="c-file">${escapeHtml(cand.fileName || 'Uploaded Resume')}</span>
      </td>
      <td><strong>${escapeHtml(cand.role || 'Unspecified')}</strong></td>
      <td><span class="table-score">${cand.score}%</span></td>
      <td>
        <span class="rec-badge ${badge.cssClass}">${badge.icon} ${badge.text}</span>
      </td>
      <td>${topSkills}</td>
      <td>
        <span class="stage-pill ${stageClass(cand.status)}">${escapeHtml(cand.status || 'Under Review')}</span>
      </td>
      <td>
        <button type="button" class="view-btn">View Dossier</button>
      </td>
    `;

    tr.querySelector('.view-btn').addEventListener('click', () => {
      openCandidateModal(cand);
    });

    candidateTableBody.appendChild(tr);
  });
}

// ----------------------------------------------------
// CANDIDATE DOSSIER MODAL & PIPELINE UPDATE
// ----------------------------------------------------
function openCandidateModal(cand) {
  selectedCandidate = cand;

  modalCandidateName.textContent = cand.candidateName || 'Candidate Profile';
  modalRole.textContent = cand.role || 'Position';
  modalScore.textContent = `${cand.score}% Fit`;

  const badge = formatRecommendationBadge(cand.recommendation);
  modalRecommendationBadge.textContent = `${badge.icon} ${badge.text}`;
  modalRecommendationBadge.className = `verdict-tag ${badge.cssClass}`;

  modalRecommendationDetails.textContent = cand.recommendationDetails || cand.summary || 'Recommendation details generated by ATS screening engine.';
  modalSummary.textContent = cand.summary || 'Summary unavailable.';

  modalFileName.textContent = cand.fileName || 'Resume Document';
  modalExp.textContent = cand.experienceAssessment || '2-4 years';
  modalEdu.textContent = cand.education || "Bachelor's Degree";
  modalModel.textContent = cand.modelUsed || 'Nemotron AI';

  modalMatchedCount.textContent = (cand.matchedSkills || []).length;
  modalMissingCount.textContent = (cand.missingSkills || []).length;

  renderSkillsList(modalMatchedSkills, cand.matchedSkills || []);
  renderSkillsList(modalMissingSkills, cand.missingSkills || [], true);

  modalStageSelect.value = cand.status || 'Under Review';
  modalNotesInput.value = cand.notes || '';

  detailModal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => {
  detailModal.classList.add('hidden');
});

detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.add('hidden');
});

saveStageBtn.addEventListener('click', async () => {
  if (!selectedCandidate) return;

  const newStatus = modalStageSelect.value;
  const newNotes = modalNotesInput.value.trim();
  const candidateId = selectedCandidate._id || selectedCandidate.id;

  saveStageBtn.disabled = true;
  saveStageBtn.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/resumes/${candidateId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: JSON.stringify({ status: newStatus, notes: newNotes }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Failed to update pipeline stage.');
    }

    selectedCandidate.status = newStatus;
    selectedCandidate.notes = newNotes;

    // Update in-memory local state
    const found = allCandidates.find((c) => (c._id && c._id === candidateId) || c.id === candidateId);
    if (found) {
      found.status = newStatus;
      found.notes = newNotes;
    }

    saveStageBtn.textContent = 'Saved ✓';
    setTimeout(() => {
      saveStageBtn.textContent = 'Save Changes';
      saveStageBtn.disabled = false;
      detailModal.classList.add('hidden');
      applyDashboardFilters();
      renderHistorySidebar(allCandidates.slice(0, 10));
    }, 600);
  } catch (error) {
    alert(error.message || 'Error updating status');
    saveStageBtn.textContent = 'Save Changes';
    saveStageBtn.disabled = false;
  }
});

// Helper for escaping HTML strings
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize on page load
updateAuthUI();
loadRecentScreenings();
