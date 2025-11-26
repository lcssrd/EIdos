(function() {
    "use strict";

    // URL de l'API (Backend sur Render)
    const API_URL = 'https://eidos-api.onrender.com'; 

    // --- Sélections DOM ---
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    const verifySection = document.getElementById('verify-section');

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const verifyForm = document.getElementById('verify-form');
    
    // NOUVEAU : Bouton de renvoi du code
    const resendCodeBtn = document.getElementById('resend-code-btn');
    
    const showSignupLink = document.getElementById('show-signup-link');
    const showLoginLink1 = document.getElementById('show-login-link-1');
    const showLoginLink2 = document.getElementById('show-login-link-2');

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
        const emailParam = urlParams.get('email'); // NOUVEAU : Récupération de l'email
        
        if (token) {
            invitationToken = token;
            console.log("Token d'invitation détecté :", invitationToken);
            
            // 1. Basculer vers l'inscription
            showSection(signupSection);

            // NOUVEAU : 2. Pré-remplir l'email si présent dans l'URL
            if (emailParam) {
                const emailInput = document.getElementById('signup-email');
                if (emailInput) {
                    emailInput.value = decodeURIComponent(emailParam);
                    // Optionnel : Vous pouvez décommenter la ligne suivante pour empêcher la modification
                    // emailInput.readOnly = true; 
                }
            }
            
            // 3. Masquer la sélection de plan et afficher le message "Centre"
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
        loginSection.classList.add('hidden');
        signupSection.classList.add('hidden');
        verifySection.classList.add('hidden');
        sectionToShow.classList.remove('hidden');
    }

    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(signupSection);
        window.history.pushState(null, '', '#signup');
    });
    showLoginLink1.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(loginSection);
        window.history.pushState(null, '', '#login');
    });
    showLoginLink2.addEventListener('click', (e) => {
        e.preventDefault();
        showSection(loginSection);
        window.history.pushState(null, '', '#login');
    });

    // --- Gestionnaires d'événements Formulaires ---

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    if (verifyForm) verifyForm.addEventListener('submit', handleVerify);
    
    // NOUVEAU : Écouteur pour le renvoi de code
    if (resendCodeBtn) resendCodeBtn.addEventListener('click', handleResendCode);

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
     * Inscription (Gère le cas "invitation validée automatiquement")
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

            // --- SUCCÈS ---
            signupForm.reset();
            
            // NOUVEAU : Si le serveur dit "verified: true" (cas invitation), on va direct au login
            if (data.verified) {
                alert("Compte créé et validé avec succès ! Vous pouvez maintenant vous connecter.");
                showSection(loginSection);
                document.getElementById('login-identifier').value = email; // Pré-remplir
                
                // Nettoyer le token de l'URL
                if (invitationToken) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    invitationToken = null;
                }
                return;
            }

            // Sinon (cas classique), on va à la vérification
            document.getElementById('verify-email').value = email;
            document.getElementById('verify-email-display').textContent = email;
            
            const testCodeDisplay = document.getElementById('test-code-display');
            if (data._test_code) {
                testCodeDisplay.textContent = `(Code pour test : ${data._test_code})`;
                testCodeDisplay.classList.remove('hidden');
            }

            showSection(verifySection);

            // Réinitialiser la sélection de plan
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
     * Vérification du code (Modifié pour connexion auto)
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

            // --- MODIFICATION : Connexion automatique ---
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                
                successMsg.textContent = 'Compte vérifié ! Connexion en cours...';
                successMsg.classList.remove('hidden');
                document.getElementById('test-code-display').classList.add('hidden');

                // Redirection directe
                setTimeout(() => {
                    window.location.href = 'simul.html';
                }, 1000);
            } else {
                // Fallback classique (si pas de token)
                successMsg.textContent = 'Compte vérifié avec succès ! Vous pouvez maintenant vous connecter.';
                successMsg.classList.remove('hidden');
                document.getElementById('test-code-display').classList.add('hidden');
                
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
     * NOUVEAU : Renvoyer le code de vérification
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

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Erreur lors de l'envoi.");
            }

            messageEl.textContent = "Code renvoyé ! Vérifiez vos spams.";
            messageEl.className = "text-xs mt-2 h-4 text-green-600";

            // Compte à rebours 60s
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