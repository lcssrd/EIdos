(function() {
    "use strict";

    // --- DETECTION INTELLIGENTE DE L'ENVIRONNEMENT ---
    // Si l'adresse contient 'vercel.app' OU 'pages.dev', on utilise le proxy (vide).
    // Sinon (eidos-simul.fr ou localhost), on utilise l'API directe.
    const IS_PROXY_ENV = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('pages.dev');
    const API_URL = IS_PROXY_ENV ? '' : 'https://api.eidos-simul.fr';

    // --- Sélections DOM ---
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    const verifySection = document.getElementById('verify-section');
    const forgotPasswordSection = document.getElementById('forgot-password-section');
    const resetPasswordSection = document.getElementById('reset-password-section');

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const verifyForm = document.getElementById('verify-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const resetPasswordForm = document.getElementById('reset-password-form');
    
    const resendCodeBtn = document.getElementById('resend-code-btn');
    
    // Liens de navigation
    const showSignupLink = document.getElementById('show-signup-link');
    const showLoginLink1 = document.getElementById('show-login-link-1');
    const showLoginLink2 = document.getElementById('show-login-link-2');
    const showForgotPasswordLink = document.getElementById('show-forgot-password-link');
    const backToLoginLink1 = document.getElementById('back-to-login-link-1');
    const backToLoginLink2 = document.getElementById('back-to-login-link-2');

    // --- Gestion de la sélection de plan ---
    const planCards = signupSection.querySelectorAll('.plan-card');
    let selectedPlan = 'free';

    planCards.forEach(card => {
        if (card.dataset.plan === 'free') {
            card.classList.add('selected');
        }
        card.addEventListener('click', () => {
            planCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedPlan = card.dataset.plan;
        });
    });
    
    // --- Gestion du token d'invitation (Centre) ---
    let invitationToken = null;
    
    function checkForInvitationToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('invitation_token');
        const emailParam = urlParams.get('email'); 
        
        if (token) {
            invitationToken = token;
            showSection(signupSection);
            if (emailParam) {
                const emailInput = document.getElementById('signup-email');
                if (emailInput) emailInput.value = decodeURIComponent(emailParam);
            }
            const planSelectionContainer = document.querySelector('#signup-form .pt-2');
            if (planSelectionContainer) {
                planSelectionContainer.innerHTML = `
                    <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 text-center">
                        <p class="text-indigo-800 font-semibold text-lg"><i class="fas fa-building mr-2"></i> Invitation Centre acceptée</p>
                        <p class="text-sm text-indigo-600 mt-2">Votre compte sera automatiquement rattaché au centre et validé.</p>
                    </div>
                `;
            }
        }
    }

    // --- Gestionnaires d'affichage ---
    function showSection(sectionToShow) {
        [loginSection, signupSection, verifySection, forgotPasswordSection, resetPasswordSection].forEach(sec => {
            if (sec) sec.classList.add('hidden');
        });
        if (sectionToShow) sectionToShow.classList.remove('hidden');
    }

    showSignupLink.addEventListener('click', (e) => { e.preventDefault(); showSection(signupSection); window.history.pushState(null, '', '#signup'); });
    showLoginLink1.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); window.history.pushState(null, '', '#login'); });
    showLoginLink2.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); window.history.pushState(null, '', '#login'); });

    if (showForgotPasswordLink) showForgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showSection(forgotPasswordSection); });
    if (backToLoginLink1) backToLoginLink1.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); });
    if (backToLoginLink2) backToLoginLink2.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); });

    // --- Gestionnaires d'événements Formulaires ---
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (verifyForm) verifyForm.addEventListener('submit', handleVerify);
    if (resendCodeBtn) resendCodeBtn.addEventListener('click', handleResendCode);
    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    if (resetPasswordForm) resetPasswordForm.addEventListener('submit', handleResetPassword);

    /**
     * Connexion
     */
    async function handleLogin(e) {
        e.preventDefault();
        
        const identifier = document.getElementById('login-identifier').value;
        const password = document.getElementById('login-password').value;
        const errorMsg = document.getElementById('login-error-message');
        const loginBtn = document.getElementById('login-btn');
        
        errorMsg.classList.add('hidden');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Connexion en cours...';

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password }),
                credentials: 'include' // [IMPORTANT] Accepte le cookie HttpOnly
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || data.error || 'Identifiants invalides');
            }

            if (data.success) {
                localStorage.setItem('isLoggedIn', 'true');
                window.location.href = 'simul.html';
            } else {
                throw new Error('Erreur de connexion inconnue.');
            }

        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Connexion';
        }
    }

    /**
     * Inscription
     */
    async function handleSignup(e) {
        e.preventDefault();

        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errorMsg = document.getElementById('signup-error-message');
        const signupBtn = document.getElementById('signup-btn');

        errorMsg.classList.add('hidden');
        signupBtn.disabled = true;
        signupBtn.textContent = 'Inscription en cours...';
        
        const requestBody = { email, password, plan: selectedPlan };
        if (invitationToken) requestBody.token = invitationToken;

        try {
            const response = await fetch(`${API_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || data.error || 'Erreur lors de l\'inscription');
            }

            signupForm.reset();
            
            if (data.verified) {
                alert("Compte créé et validé avec succès ! Vous pouvez maintenant vous connecter.");
                showSection(loginSection);
                document.getElementById('login-identifier').value = email;
                if (invitationToken) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    invitationToken = null;
                }
                return;
            }

            document.getElementById('verify-email').value = email;
            document.getElementById('verify-email-display').textContent = email;
            showSection(verifySection);
            
            // Reset plan selection
            planCards.forEach(c => c.classList.remove('selected'));
            planCards[0].classList.add('selected');
            selectedPlan = 'free';

        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
        } finally {
            signupBtn.disabled = false;
            signupBtn.textContent = 'S\'inscrire';
        }
    }
    
    /**
     * Vérification du code
     */
    async function handleVerify(e) {
        e.preventDefault();

        const email = document.getElementById('verify-email').value;
        const code = document.getElementById('verify-code').value;
        const errorMsg = document.getElementById('verify-error-message');
        const successMsg = document.getElementById('verify-success-message');
        const verifyBtn = document.getElementById('verify-btn');

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Vérification...';

        try {
            const response = await fetch(`${API_URL}/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code }),
                credentials: 'include' // [IMPORTANT] Accepte le cookie après vérification réussie
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la vérification');
            }

            if (data.success) {
                localStorage.setItem('isLoggedIn', 'true');
                
                successMsg.textContent = 'Compte vérifié ! Connexion en cours...';
                successMsg.classList.remove('hidden');
                document.getElementById('test-code-display')?.classList.add('hidden');

                setTimeout(() => {
                    window.location.href = 'simul.html';
                }, 1000);
            } else {
                throw new Error("Erreur inattendue.");
            }

        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Vérifier';
        }
    }

    /**
     * Renvoyer le code
     */
    async function handleResendCode(e) {
        e.preventDefault();
        const email = document.getElementById('verify-email').value;
        const messageEl = document.getElementById('resend-message');
        const btn = document.getElementById('resend-code-btn');
        
        if (!email) {
             messageEl.textContent = "Email manquant. Veuillez vous reconnecter.";
             messageEl.className = "text-xs mt-2 h-4 text-red-600";
             return;
        }

        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        messageEl.textContent = "Envoi en cours...";
        messageEl.className = "text-xs mt-2 h-4 text-gray-500";

        try {
            const response = await fetch(`${API_URL}/auth/resend-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Erreur lors de l'envoi.");
            }

            messageEl.textContent = "Code renvoyé ! Vérifiez vos spams.";
            messageEl.className = "text-xs mt-2 h-4 text-green-600";

            let countdown = 60;
            const interval = setInterval(() => {
                btn.textContent = `Renvoyer (${countdown}s)`;
                countdown--;
                if (countdown < 0) {
                    clearInterval(interval);
                    btn.textContent = "Renvoyer le code";
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                    messageEl.textContent = "";
                }
            }, 1000);

        } catch (err) {
            messageEl.textContent = err.message;
            messageEl.className = "text-xs mt-2 h-4 text-red-600";
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    async function handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const errorMsg = document.getElementById('forgot-error-message');
        const successMsg = document.getElementById('forgot-success-message');
        const btn = document.getElementById('forgot-btn');

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = 'Envoi...';

        try {
            const response = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Erreur");
            successMsg.textContent = "Code envoyé ! Vérifiez votre boîte mail.";
            successMsg.classList.remove('hidden');
            document.getElementById('reset-email-hidden').value = email;
            setTimeout(() => { showSection(resetPasswordSection); }, 1500);
        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Envoyer le code';
        }
    }

    async function handleResetPassword(e) {
        e.preventDefault();
        const email = document.getElementById('reset-email-hidden').value;
        const code = document.getElementById('reset-code').value;
        const newPassword = document.getElementById('reset-new-password').value;
        const errorMsg = document.getElementById('reset-error-message');
        const successMsg = document.getElementById('reset-success-message');
        const btn = document.getElementById('reset-btn');

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = 'Mise à jour...';

        try {
            const response = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, newPassword })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Erreur");
            successMsg.textContent = "Mot de passe modifié ! Redirection...";
            successMsg.classList.remove('hidden');
            setTimeout(() => {
                showSection(loginSection);
                document.getElementById('login-identifier').value = email;
                document.getElementById('reset-password-form').reset();
            }, 2000);
        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Réinitialiser';
        }
    }
    
    function checkForHash() {
        if (window.location.hash === '#signup') {
            showSection(signupSection);
        }
    }

    checkForInvitationToken();
    checkForHash();

})();