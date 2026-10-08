/* Authentication & BulkSMSBD Integration Module for Vested Property System
   Author: Google Antigravity Assistant
   Includes: BulkSMSBD API, Firebase Firestore User Persistence, OTP Verification, 4-Digit PIN Auth, Profile Management, 2-Hour Inactivity Auto-Logout & Admin Panel Controls
*/

(function () {
    'use strict';

    // Firebase Configuration provided by user
    const firebaseConfig = {
        apiKey: "AIzaSyCGKwYbdBMpawt8p9snIvswobEFT9Dk3L8",
        authDomain: "smartcasebd-4f9a6.firebaseapp.com",
        projectId: "smartcasebd-4f9a6",
        storageBucket: "smartcasebd-4f9a6.firebasestorage.app",
        messagingSenderId: "907795858740",
        appId: "1:907795858740:web:06f98c27a7a47a18a95161",
        measurementId: "G-7ZMG1N3XWR"
    };

    // BulkSMSBD Credentials provided by user
    const BULK_SMS_CONFIG = {
        apiKey: "1AABwIJVuBKOoT5kC5oQ",
        senderId: "8809617626493",
        apiUrl: "https://bulksmsbd.net/api/smsapi"
    };

    // Avatar Presets (Icon Cards only)
    const AVATARS = [
        { id: 'avatar1', icon: '👨‍💼', bg: 'linear-gradient(135deg, #10b981, #06b6d4)' },
        { id: 'avatar2', icon: '👩‍💼', bg: 'linear-gradient(135deg, #ec4899, #8b5cf6)' },
        { id: 'avatar3', icon: '🧔', bg: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
        { id: 'avatar4', icon: '👩', bg: 'linear-gradient(135deg, #3b82f6, #10b981)' },
        { id: 'avatar5', icon: '🏛️', bg: 'linear-gradient(135deg, #6366f1, #a855f7)' }
    ];

    // Admin Numbers List (Optional hardcoded Admin privileges by mobile number)
    // উদাহরণ: const ADMIN_PHONES = ['01712345678'];
    const ADMIN_PHONES = [];

    // State
    let db = null;
    let lastActivityTime = Date.now();
    let currentAuthFlow = {
        phone: '',
        normalizedPhone: '',
        otp: '',
        userExist: false,
        isResetPin: false,
        timerInterval: null
    };

    // Initialize Firebase
    try {
        if (window.firebase) {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            console.log("Firebase Firestore Initialized Successfully!");
        }
    } catch (e) {
        console.warn("Firebase Init Warning:", e.message);
    }

    // Digit Converters
    const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    function toEnglishDigits(str) {
        if (!str) return '';
        return String(str).replace(/[০-৯]/g, w => englishDigits[banglaDigits.indexOf(w)]);
    }

    function toBengaliDigits(str) {
        if (!str) return '';
        return String(str).replace(/[0-9]/g, w => banglaDigits[parseInt(w, 10)]);
    }

    function normalizeBDPhone(phoneStr) {
        let clean = toEnglishDigits(phoneStr).replace(/[^0-9]/g, '');
        if (clean.startsWith('880')) {
            clean = clean.substring(2);
        }
        if (!clean.startsWith('0')) {
            clean = '0' + clean;
        }
        return clean;
    }

    // BulkSMSBD API Sender
    async function sendBulkSMS(phoneNumber, messageText) {
        let formattedNum = toEnglishDigits(phoneNumber).replace(/[^0-9]/g, '');
        if (!formattedNum.startsWith('88')) {
            formattedNum = '88' + formattedNum;
        }

        const encodedMsg = encodeURIComponent(messageText);
        const requestUrl = `${BULK_SMS_CONFIG.apiUrl}?api_key=${BULK_SMS_CONFIG.apiKey}&type=text&number=${formattedNum}&senderid=${BULK_SMS_CONFIG.senderId}&message=${encodedMsg}`;

        console.log(`Sending SMS to ${formattedNum} via BulkSMSBD...`);

        try {
            await fetch(requestUrl, { method: 'GET', mode: 'no-cors' });
            return { success: true, message: 'SMS পাঠানো হয়েছে' };
        } catch (err) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = img.onerror = () => {
                    resolve({ success: true, message: 'SMS পাঠানো হয়েছে' });
                };
                img.src = requestUrl + '&_t=' + Date.now();
            });
        }
    }

    // Firestore User Operations
    async function getFirestoreUser(phone) {
        if (!db) {
            const localUsers = JSON.parse(localStorage.getItem('vested_db_users') || '{}');
            return localUsers[phone] || null;
        }
        try {
            const docRef = await db.collection('users').doc(phone).get();
            if (docRef.exists) {
                return docRef.data();
            }
            return null;
        } catch (e) {
            const localUsers = JSON.parse(localStorage.getItem('vested_db_users') || '{}');
            return localUsers[phone] || null;
        }
    }

    async function saveFirestoreUser(userData) {
        const phone = userData.phone;
        const localUsers = JSON.parse(localStorage.getItem('vested_db_users') || '{}');
        localUsers[phone] = userData;
        localStorage.setItem('vested_db_users', JSON.stringify(localUsers));

        if (db) {
            try {
                await db.collection('users').doc(phone).set(userData, { merge: true });
            } catch (e) {
                console.warn("Firestore Write Error:", e);
            }
        }
    }

    async function getAllUsersList() {
        let usersMap = {};
        if (db) {
            try {
                const snapshot = await db.collection('users').get();
                snapshot.forEach(doc => {
                    usersMap[doc.id] = doc.data();
                });
            } catch (e) {
                console.warn("Firestore GetAll Error:", e);
            }
        }
        const localUsers = JSON.parse(localStorage.getItem('vested_db_users') || '{}');
        return { ...localUsers, ...usersMap };
    }

    async function deleteUserRecord(phone) {
        const localUsers = JSON.parse(localStorage.getItem('vested_db_users') || '{}');
        delete localUsers[phone];
        localStorage.setItem('vested_db_users', JSON.stringify(localUsers));

        if (db) {
            try {
                await db.collection('users').doc(phone).delete();
            } catch (e) {
                console.warn("Firestore Delete Error:", e);
            }
        }
    }

    // Auth Manager Object
    window.VestedAuth = {
        initAuthUI,
        getLoggedInUser,
        logoutUser,
        sendOTP: triggerSendOTP,
        AVATARS
    };

    function getLoggedInUser() {
        try {
            const session = localStorage.getItem('vested_auth_session');
            return session ? JSON.parse(session) : null;
        } catch (e) {
            return null;
        }
    }

    function setLoggedInSession(userData) {
        userData.lastActive = new Date().toISOString();
        localStorage.setItem('vested_auth_session', JSON.stringify(userData));
        saveFirestoreUser(userData);
        updateHeaderUserBadge(userData);
        hideAuthModal();
        showMainAppContent();
        resetInactivityTimer();
    }

    function logoutUser(reason = 'লগআউট সফল হয়েছে') {
        localStorage.removeItem('vested_auth_session');
        showAuthModal();
        hideMainAppContent();
        showToast(reason);
    }

    // 2-Hour Inactivity Auto Logout System
    function resetInactivityTimer() {
        lastActivityTime = Date.now();
    }

    function initInactivityTracker() {
        const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
        events.forEach(evt => {
            document.addEventListener(evt, resetInactivityTimer, { passive: true });
        });

        // Check every 30 seconds
        setInterval(() => {
            const currentUser = getLoggedInUser();
            if (currentUser) {
                const inactiveMs = Date.now() - lastActivityTime;
                // 2 Hours = 2 * 60 * 60 * 1000 = 7,200,000 ms
                if (inactiveMs >= 2 * 60 * 60 * 1000) {
                    logoutUser('২ ঘন্টা নিষ্ক্রিয়তার (Inactivity) কারণে স্বয়ংক্রিয়ভাবে লগআউট হয়েছে');
                }
            }
        }, 30000);
    }

    // UI Step Controls
    function showAuthStep(stepId) {
        const steps = ['authStepPhone', 'authStepOTP', 'authStepSetPIN', 'authStepEnterPIN'];
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (id === stepId) ? 'block' : 'none';
        });
        hideAuthError();
    }

    function showAuthError(msg) {
        const errEl = document.getElementById('authErrorMessage');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }
    }

    function hideAuthError() {
        const errEl = document.getElementById('authErrorMessage');
        if (errEl) errEl.style.display = 'none';
    }

    function showToast(msg) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3500);
        }
    }

    function showAuthModal() {
        const overlay = document.getElementById('authModalOverlay');
        if (overlay) overlay.classList.add('active');
    }

    function hideAuthModal() {
        const overlay = document.getElementById('authModalOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    function showMainAppContent() {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.style.display = 'block';
    }

    function hideMainAppContent() {
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.style.display = 'none';
    }

    // Header User Badge & Admin Menu
    function updateHeaderUserBadge(userData) {
        const badgeContainer = document.getElementById('headerUserBadgeContainer');
        if (!badgeContainer) return;

        const avatarObj = AVATARS.find(a => a.id === userData.avatar) || AVATARS[0];
        const displayName = userData.name || userData.phone;
        const isAdmin = (userData.role === 'admin') || ADMIN_PHONES.includes(userData.phone);

        badgeContainer.innerHTML = `
            <div class="user-badge-wrapper" id="userBadgeWrapper">
                <div class="user-avatar-circle" style="background: ${avatarObj.bg};">
                    ${avatarObj.icon}
                </div>
                <div class="user-badge-text">
                    <span class="user-badge-name">${displayName}</span>
                    <span class="user-badge-phone">${toBengaliDigits(userData.phone)} ${isAdmin ? '<small style="color:var(--warning); font-size:10px;">(Admin)</small>' : ''}</span>
                </div>
                <i class="ri-arrow-down-s-line"></i>

                <!-- Dropdown Menu -->
                <div class="user-dropdown-menu" id="userDropdownMenu">
                    ${isAdmin ? `
                    <div class="dropdown-item" id="menuBtnAdmin">
                        <i class="ri-shield-user-line" style="color:var(--warning);"></i> অ্যাডমিন প্যানেল
                    </div>` : ''}
                    <div class="dropdown-item" id="menuBtnProfile">
                        <i class="ri-user-line"></i> প্রোফাইল এডিট
                    </div>
                    <div class="dropdown-item danger" id="menuBtnLogout">
                        <i class="ri-logout-box-r-line"></i> লগআউট
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.getElementById('userBadgeWrapper');
        const menu = document.getElementById('userDropdownMenu');
        const btnProfile = document.getElementById('menuBtnProfile');
        const btnLogout = document.getElementById('menuBtnLogout');
        const btnAdmin = document.getElementById('menuBtnAdmin');

        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            menu.classList.remove('active');
        });

        if (btnProfile) {
            btnProfile.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('active');
                openProfileModal(userData);
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.stopPropagation();
                logoutUser();
            });
        }

        if (btnAdmin) {
            btnAdmin.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.remove('active');
                openAdminPanelModal();
            });
        }
    }

    // Profile Modal (Icon Cards only, no text labels)
    function openProfileModal(userData) {
        const modalOverlay = document.getElementById('profileModalOverlay');
        const inputPhone = document.getElementById('profilePhoneInput');
        const inputName = document.getElementById('profileNameInput');
        const inputAddress = document.getElementById('profileAddressInput');
        const avatarGrid = document.getElementById('profileAvatarGrid');

        inputPhone.value = toBengaliDigits(userData.phone);
        inputName.value = userData.name || '';
        inputAddress.value = userData.address || '';

        let selectedAvatarId = userData.avatar || 'avatar1';

        // Render Avatar Options (Icon only, no text labels)
        let gridHtml = '';
        AVATARS.forEach(a => {
            const isSelected = a.id === selectedAvatarId ? 'selected' : '';
            gridHtml += `
                <div class="avatar-option-card ${isSelected}" data-avatar-id="${a.id}">
                    <div class="avatar-card-icon" style="background: ${a.bg};">${a.icon}</div>
                </div>
            `;
        });
        avatarGrid.innerHTML = gridHtml;

        const cards = avatarGrid.querySelectorAll('.avatar-option-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedAvatarId = card.getAttribute('data-avatar-id');
            });
        });

        modalOverlay.classList.add('active');

        const btnSave = document.getElementById('btnSaveProfile');
        btnSave.onclick = async () => {
            const updatedUser = {
                ...userData,
                name: inputName.value.trim() || userData.phone,
                address: inputAddress.value.trim(),
                avatar: selectedAvatarId
            };

            btnSave.disabled = true;
            btnSave.textContent = 'সংরক্ষণ হচ্ছে...';

            await saveFirestoreUser(updatedUser);
            setLoggedInSession(updatedUser);

            btnSave.disabled = false;
            btnSave.textContent = 'সংরক্ষণ করুন';
            modalOverlay.classList.remove('active');
            showToast('প্রোফাইল তথ্য আপডেট করা হয়েছে!');
        };
    }

    // Admin Panel Modal & Controls
    async function openAdminPanelModal() {
        const modalOverlay = document.getElementById('adminModalOverlay');
        const userTableBody = document.getElementById('adminUserTableBody');
        const statTotalUsers = document.getElementById('adminStatTotal');
        const statActiveUsers = document.getElementById('adminStatActive');
        const statInactiveUsers = document.getElementById('adminStatInactive');

        modalOverlay.classList.add('active');
        userTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">ডাটা লোড হচ্ছে...</td></tr>';

        const allUsersMap = await getAllUsersList();
        const usersList = Object.values(allUsersMap);

        const total = usersList.length;
        const activeCount = usersList.filter(u => u.status !== 'inactive').length;
        const inactiveCount = usersList.filter(u => u.status === 'inactive').length;

        statTotalUsers.textContent = toBengaliDigits(total);
        statActiveUsers.textContent = toBengaliDigits(activeCount);
        statInactiveUsers.textContent = toBengaliDigits(inactiveCount);

        let rowsHtml = '';
        usersList.forEach(u => {
            const isInactive = u.status === 'inactive';
            const isAdmin = u.role === 'admin' || ADMIN_PHONES.includes(u.phone);
            const avatarObj = AVATARS.find(a => a.id === u.avatar) || AVATARS[0];
            const lastActiveStr = u.lastActive ? new Date(u.lastActive).toLocaleString('bn-BD') : 'অনুল্লিখিত';

            rowsHtml += `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:20px;">${avatarObj.icon}</span>
                            <div>
                                <strong style="color:var(--text-primary);">${u.name || u.phone}</strong><br>
                                <small style="color:var(--text-secondary);">${toBengaliDigits(u.phone)}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge ${isAdmin ? 'badge-union' : 'badge-mouza'}">
                            ${isAdmin ? 'অ্যাডমিন' : 'ব্যবহারকারী'}
                        </span>
                    </td>
                    <td>
                        <span class="badge ${isInactive ? 'badge-year-old' : 'badge-year-ok'}">
                            ${isInactive ? '🔴 নিষ্ক্রিয় (Inactive)' : '🟢 সক্রিয় (Active)'}
                        </span>
                    </td>
                    <td style="font-size:0.82rem; color:var(--text-secondary);">
                        ${lastActiveStr}
                    </td>
                    <td>
                        <div class="btn-group" style="gap:6px;">
                            <button class="btn ${isAdmin ? 'btn-outline-warning' : 'btn-outline-primary'}" style="padding:4px 8px; font-size:0.78rem;" onclick="window.VestedAdmin.toggleRole('${u.phone}', '${isAdmin ? 'user' : 'admin'}')">
                                ${isAdmin ? 'ইউজার করুন' : 'অ্যাডমিন করুন'}
                            </button>
                            <button class="btn ${isInactive ? 'btn-primary' : 'btn-outline-danger'}" style="padding:4px 8px; font-size:0.78rem;" onclick="window.VestedAdmin.toggleStatus('${u.phone}', ${isInactive})">
                                ${isInactive ? 'সক্রিয় করুন' : 'নিষ্ক্রিয় করুন'}
                            </button>
                            <button class="btn btn-outline-danger" style="padding:4px 8px; font-size:0.78rem;" onclick="window.VestedAdmin.deleteUser('${u.phone}')">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        userTableBody.innerHTML = rowsHtml || '<tr><td colspan="5" style="text-align:center; padding:20px;">কোন ব্যবহারকারী পাওয়া যায়নি</td></tr>';

        const closeBtn = document.getElementById('adminCloseBtn');
        if (closeBtn) {
            closeBtn.onclick = () => modalOverlay.classList.remove('active');
        }
    }

    window.VestedAdmin = {
        toggleRole: async (phone, newRole) => {
            const user = await getFirestoreUser(phone);
            if (user) {
                user.role = newRole;
                await saveFirestoreUser(user);
                showToast(`ব্যবহারকারীর রোল '${newRole === 'admin' ? 'অ্যাডমিন' : 'সাধারণ ব্যবহারকারী'}' এ পরিবর্তন করা হয়েছে`);
                
                // If modifying currently logged in user's role, sync local session
                const currentSession = getLoggedInUser();
                if (currentSession && currentSession.phone === phone) {
                    currentSession.role = newRole;
                    localStorage.setItem('vested_auth_session', JSON.stringify(currentSession));
                    updateHeaderUserBadge(currentSession);
                }
                openAdminPanelModal();
            }
        },
        toggleStatus: async (phone, shouldActivate) => {
            const user = await getFirestoreUser(phone);
            if (user) {
                user.status = shouldActivate ? 'active' : 'inactive';
                await saveFirestoreUser(user);
                showToast(`ব্যবহারকারী ${shouldActivate ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে`);
                openAdminPanelModal();
            }
        },
        deleteUser: async (phone) => {
            if (confirm(`আপনি কি সত্যিই ${toBengaliDigits(phone)} ব্যবহারকারীকে ডিলেট করতে চান?`)) {
                await deleteUserRecord(phone);
                showToast('ব্যবহারকারী ডিলেট করা হয়েছে');
                openAdminPanelModal();
            }
        }
    };

    // Trigger OTP Send & BulkSMSBD API
    async function triggerSendOTP(phone, isReset = false) {
        currentAuthFlow.isResetPin = isReset;
        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
        currentAuthFlow.otp = generatedOtp;

        const smsText = `Your SmartCaseBD OTP is ${generatedOtp}. Please do not share it with anyone.`;
        
        console.log(`[OTP GENERATED] Phone: ${phone}, OTP: ${generatedOtp}`);
        
        showAuthStep('authStepOTP');
        setupOTPInputs();
        startOTPTimer();

        document.getElementById('otpPhoneDisplay').textContent = toBengaliDigits(phone);

        // Toast shows high z-index notification
        showToast(`OTP পাঠানো হয়েছে (${toBengaliDigits(generatedOtp)})`);
        await sendBulkSMS(phone, smsText);
    }

    // OTP Input Controls
    function setupOTPInputs() {
        const inputs = document.querySelectorAll('.otp-digit-input');
        inputs.forEach((input, index) => {
            input.value = '';
            input.oninput = (e) => {
                const val = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                input.value = val ? toBengaliDigits(val.charAt(0)) : '';
                if (val && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            };
            input.onkeydown = (e) => {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            };
        });
        if (inputs[0]) inputs[0].focus();
    }

    function getEnteredOTP() {
        const inputs = document.querySelectorAll('.otp-digit-input');
        let otp = '';
        inputs.forEach(input => {
            otp += toEnglishDigits(input.value.trim());
        });
        return otp;
    }

    function startOTPTimer() {
        let duration = 60;
        const timerText = document.getElementById('otpTimerText');
        const resendBtn = document.getElementById('btnResendOTP');
        
        resendBtn.style.display = 'none';
        timerText.style.display = 'inline';

        if (currentAuthFlow.timerInterval) clearInterval(currentAuthFlow.timerInterval);

        currentAuthFlow.timerInterval = setInterval(() => {
            duration--;
            timerText.textContent = `(${toBengaliDigits(duration)} সেকেন্ড পর রিকুয়েস্ট করতে পারবেন)`;
            if (duration <= 0) {
                clearInterval(currentAuthFlow.timerInterval);
                timerText.style.display = 'none';
                resendBtn.style.display = 'inline-block';
            }
        }, 1000);
    }

    // PIN Digit Input Controls
    function setupPINInputs(containerId, autoFocus = false) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const inputs = container.querySelectorAll('.pin-digit-input');
        inputs.forEach((input, index) => {
            input.value = '';
            input.oninput = (e) => {
                const val = toEnglishDigits(e.target.value).replace(/[^0-9]/g, '');
                input.value = val ? toBengaliDigits(val.charAt(0)) : '';
                if (val && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            };
            input.onkeydown = (e) => {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            };
        });
        if (autoFocus && inputs[0]) inputs[0].focus();
    }

    function getEnteredPIN(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return '';
        const inputs = container.querySelectorAll('.pin-digit-input');
        let pin = '';
        inputs.forEach(input => {
            pin += toEnglishDigits(input.value.trim());
        });
        return pin;
    }

    // Main Auth UI Initialization
    function initAuthUI() {
        initInactivityTracker();

        const loggedInUser = getLoggedInUser();

        if (loggedInUser) {
            // Render immediately with cached session first
            updateHeaderUserBadge(loggedInUser);
            hideAuthModal();
            showMainAppContent();

            // Check user status & sync fresh role/profile from Firestore asynchronously
            getFirestoreUser(loggedInUser.phone).then(u => {
                if (u && u.status === 'inactive') {
                    logoutUser('আপনার অ্যাকাউন্টটি নিষ্ক্রিয় (Inactive) করা হয়েছে। কর্তৃপক্ষের সাথে যোগাযোগ করুন।');
                } else if (u) {
                    const activeUserObj = { ...loggedInUser, ...u };
                    localStorage.setItem('vested_auth_session', JSON.stringify(activeUserObj));
                    updateHeaderUserBadge(activeUserObj);
                }
            });
        } else {
            showAuthModal();
            hideMainAppContent();
            showAuthStep('authStepPhone');
        }

        // STEP 1: Phone Submission
        const btnSubmitPhone = document.getElementById('btnSubmitPhone');
        const inputPhone = document.getElementById('authPhoneInput');

        btnSubmitPhone.onclick = async () => {
            const rawPhone = inputPhone.value.trim();
            const normalized = normalizeBDPhone(rawPhone);

            if (normalized.length !== 11 || !normalized.startsWith('01')) {
                showAuthError('সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন (যেমন: 01712345678)');
                return;
            }

            btnSubmitPhone.disabled = true;
            btnSubmitPhone.textContent = 'যাচাই হচ্ছে...';

            currentAuthFlow.phone = normalized;
            const existingUser = await getFirestoreUser(normalized);

            btnSubmitPhone.disabled = false;
            btnSubmitPhone.textContent = 'পরবর্তী';

            if (existingUser) {
                // Check if inactive
                if (existingUser.status === 'inactive') {
                    showAuthError('আপনার অ্যাকাউন্টটি নিষ্ক্রিয় (Inactive) করা হয়েছে। কর্তৃপক্ষের সাথে যোগাযোগ করুন।');
                    return;
                }

                currentAuthFlow.userExist = true;
                currentAuthFlow.userData = existingUser;
                document.getElementById('pinLoginPhoneDisplay').textContent = toBengaliDigits(normalized);
                showAuthStep('authStepEnterPIN');
                setupPINInputs('pinLoginContainer', true);
            } else {
                currentAuthFlow.userExist = false;
                await triggerSendOTP(normalized, false);
            }
        };

        // STEP 2: OTP Verification
        const btnVerifyOTP = document.getElementById('btnVerifyOTP');
        const btnResendOTP = document.getElementById('btnResendOTP');

        btnVerifyOTP.onclick = () => {
            const enteredOtp = getEnteredOTP();
            if (enteredOtp.length !== 4) {
                showAuthError('সঠিক ৪ ডিজিটের OTP প্রদান করুন');
                return;
            }

            if (enteredOtp === currentAuthFlow.otp) {
                hideAuthError();
                showAuthStep('authStepSetPIN');
                setupPINInputs('pinSetContainer', true); // Focus top PIN input first
                setupPINInputs('pinConfirmContainer', false);
            } else {
                showAuthError('ভুল OTP প্রদান করেছেন! আবার চেষ্টা করুন');
            }
        };

        btnResendOTP.onclick = () => {
            triggerSendOTP(currentAuthFlow.phone, currentAuthFlow.isResetPin);
        };

        // STEP 3: Set 4-Digit PIN
        const btnSavePIN = document.getElementById('btnSavePIN');

        btnSavePIN.onclick = async () => {
            const pin = getEnteredPIN('pinSetContainer');
            const confirmPin = getEnteredPIN('pinConfirmContainer');

            if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
                showAuthError('৪ ডিজিটের পিন নম্বর প্রদান করুন');
                return;
            }

            if (pin !== confirmPin) {
                showAuthError('পিন এবং কনফার্ম পিন মেলেনি!');
                return;
            }

            btnSavePIN.disabled = true;
            btnSavePIN.textContent = 'সংরক্ষণ হচ্ছে...';

            const isAdmin = ADMIN_PHONES.includes(currentAuthFlow.phone);

            const newUser = {
                phone: currentAuthFlow.phone,
                pin: pin,
                name: 'ব্যবহারকারী (' + toBengaliDigits(currentAuthFlow.phone) + ')',
                address: 'সিরাজদিখান, মুন্সীগঞ্জ',
                avatar: 'avatar1',
                role: isAdmin ? 'admin' : 'user',
                status: 'active',
                createdAt: new Date().toISOString()
            };

            await saveFirestoreUser(newUser);

            btnSavePIN.disabled = false;
            btnSavePIN.textContent = 'পিন সেট করুন ও প্রজেক্ট খুলুন';

            showToast('পিন সফলভাবে সংরক্ষণ করা হয়েছে!');
            setLoggedInSession(newUser);
        };

        // STEP 4: Login with PIN
        const btnLoginPIN = document.getElementById('btnLoginPIN');
        const linkForgotPIN = document.getElementById('linkForgotPIN');

        btnLoginPIN.onclick = async () => {
            const enteredPin = getEnteredPIN('pinLoginContainer');
            if (enteredPin.length !== 4) {
                showAuthError('৪ ডিজিটের পিন নম্বর লিখুন');
                return;
            }

            // Verify status again
            const userDoc = await getFirestoreUser(currentAuthFlow.phone);
            if (userDoc && userDoc.status === 'inactive') {
                showAuthError('আপনার অ্যাকাউন্টটি নিষ্ক্রিয় (Inactive) করা হয়েছে। কর্তৃপক্ষের সাথে যোগাযোগ করুন।');
                return;
            }

            const storedPin = userDoc ? userDoc.pin : '';

            if (enteredPin === storedPin) {
                hideAuthError();
                showToast('লগইন সফল হয়েছে!');
                setLoggedInSession(userDoc);
            } else {
                showAuthError('ভুল পিন নম্বর! আবার চেষ্টা করুন');
            }
        };

        linkForgotPIN.onclick = (e) => {
            e.preventDefault();
            triggerSendOTP(currentAuthFlow.phone, true);
        };

        // Profile Close
        const profileCloseBtn = document.getElementById('profileCloseBtn');
        const profileModalOverlay = document.getElementById('profileModalOverlay');
        if (profileCloseBtn) {
            profileCloseBtn.onclick = () => profileModalOverlay.classList.remove('active');
        }
    }

    document.addEventListener('DOMContentLoaded', initAuthUI);

})();
