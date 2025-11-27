(function () {
    // NOUVEAU : Sections Mot de passe oublié
    const forgotPasswordSection = document.getElementById('forgot-password-section');
    const resetPasswordSection = document.getElementById('reset-password-section');

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const verifyForm = document.getElementById('verify-form');
    // NOUVEAU : Formulaires Mot de passe oublié
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const resetPasswordForm = document.getElementById('reset-password-form');

    const resendCodeBtn = document.getElementById('resend-code-btn');

    // Liens de navigation
    const showSignupLink = document.getElementById('show-signup-link');
    const showLoginLink1 = document.getElementById('show-login-link-1');
    const showLoginLink2 = document.getElementById('show-login-link-2');
    // NOUVEAU : Liens Mot de passe oublié
    const showForgotPasswordLink = document.getElementById('show-forgot-password-link');
    const backToLoginLink1 = document.getElementById('back-to-login-link-1');
    const backToLoginLink2 = document.getElementById('back-to-login-link-2');

    // --- Gestion de la sélection de plan ---
    const planCards = signupSection.querySelectorAll('.plan-card');
    let selectedPlan = 'free'; // 'free' par défaut

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
            console.log("Token d'invitation détecté :", invitationToken);

            showSection(signupSection);

            if (emailParam) {
                const emailInput = document.getElementById('signup-email');
                if (emailInput) {
                    emailInput.value = decodeURIComponent(emailParam);
                }
            }

            const planSelectionContainer = document.querySelector('#signup-form .pt-2');

            if (planSelectionContainer) {
                planSelectionContainer.innerHTML = `
                    <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 text-center">
                        <p class="text-indigo-800 font-semibold text-lg">
                            <i class="fas fa-building mr-2"></i> Invitation Centre acceptée
                        </p>
                        <p class="text-sm text-indigo-600 mt-2">
                            Vous n'avez pas besoin de choisir d'abonnement.<br>
                            Votre compte sera automatiquement rattaché au centre et validé.
                        </p>
                    </div>
                `;
            }
        }
    }

    // --- Gestionnaires d'affichage ---
    function showSection(sectionToShow) {
        // On cache tout
        [loginSection, signupSection, verifySection, forgotPasswordSection, resetPasswordSection].forEach(sec => {
            if (sec) sec.classList.add('hidden');
        });
        // On affiche la cible
        if (sectionToShow) sectionToShow.classList.remove('hidden');
    }

    // Écouteurs Navigation de base
    showSignupLink.addEventListener('click', (e) => { e.preventDefault(); showSection(signupSection); window.history.pushState(null, '', '#signup'); });
    showLoginLink1.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); window.history.pushState(null, '', '#login'); });
    showLoginLink2.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); window.history.pushState(null, '', '#login'); });

    // NOUVEAU : Écouteurs Navigation Mot de passe oublié
    if (showForgotPasswordLink) {
        showForgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(forgotPasswordSection);
        });
    }
    if (backToLoginLink1) backToLoginLink1.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); });
    if (backToLoginLink2) backToLoginLink2.addEventListener('click', (e) => { e.preventDefault(); showSection(loginSection); });


    // --- Gestionnaires d'événements Formulaires ---

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (verifyForm) verifyForm.addEventListener('submit', handleVerify);
    if (resendCodeBtn) resendCodeBtn.addEventListener('click', handleResendCode);

    // NOUVEAU : Listeners formulaires MDP
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
                body: JSON.stringify({ identifier, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Identifiants invalides');
            }

            if (data.token) {
                localStorage.setItem('authToken', data.token);
                window.location.href = 'simul.html';
            } else {
                throw new Error('Aucun token reçu du serveur.');
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

        const requestBody = {
            email: email,
            password: password,
            plan: selectedPlan
        };

        if (invitationToken) {
            requestBody.token = invitationToken;
        }

        try {
            const response = await fetch(`${API_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de l\'inscription');
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

            const testCodeDisplay = document.getElementById('test-code-display');
            if (data._test_code) {
                testCodeDisplay.textContent = `(Code pour test : ${data._test_code})`;
                testCodeDisplay.classList.remove('hidden');
            }

            showSection(verifySection);

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
     * Vérification du code (AVEC REDIRECTION AUTO)
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
                body: JSON.stringify({ email, code })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la vérification');
            }

            // --- MODIFICATION MAJEURE : Connexion automatique ---
            if (data.token) {
                localStorage.setItem('authToken', data.token);

                successMsg.textContent = 'Compte vérifié ! Connexion en cours...';
                successMsg.classList.remove('hidden');
                document.getElementById('test-code-display').classList.add('hidden');

                // Redirection directe vers le simulateur
                setTimeout(() => {
                    window.location.href = 'simul.html';
                }, 1000);
            } else {
                // Fallback (ne devrait pas arriver avec le nouveau backend)
                successMsg.textContent = 'Compte vérifié. Veuillez vous connecter.';
                successMsg.classList.remove('hidden');
                setTimeout(() => {
                    showSection(loginSection);
                    verifyForm.reset();
                    successMsg.classList.add('hidden');
                }, 2000);
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

    /**
     * NOUVEAU : Demander la réinitialisation (Envoi email)
     */
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

            // Succès : on passe à l'étape suivante (saisie du code)
            successMsg.textContent = "Code envoyé ! Vérifiez votre boîte mail.";
            successMsg.classList.remove('hidden');

            // Stocker l'email pour l'étape suivante
            document.getElementById('reset-email-hidden').value = email;

            setTimeout(() => {
                showSection(resetPasswordSection);
            }, 1500);

        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Envoyer le code';
        }
    }

    /**
     * NOUVEAU : Valider le nouveau mot de passe
     */
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
                // Pré-remplir le login
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

    // Vérification du hash au chargement
    function checkForHash() {
        if (window.location.hash === '#signup') {
            showSection(signupSection);
        }
    }

    // Initialisation
    checkForInvitationToken();
    checkForHash();

})();