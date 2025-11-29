(function() {
    "use strict";

    // URL de l'API (Mise à jour pour le sous-domaine)
    const API_URL = 'https://api.eidos-simul.fr'; 
    
    // Variable pour stocker la connexion socket
    let socket = null;

    // --- Fonctions d'authentification "privées" ---

    // [MODIFIÉ] On ne manipule plus le token directement
    function getAuthToken() {
        // Cette fonction ne sert plus à récupérer le token brut.
        // On retourne true si le flag localStorage est présent.
        return localStorage.getItem('isLoggedIn') === 'true';
    }

    // [MODIFIÉ] Suppression du Header Authorization
    function getAuthHeaders() {
        // Le token est désormais envoyé automatiquement par le navigateur dans le Cookie.
        // On ne met QUE le Content-Type et l'ID du socket si nécessaire.
        const headers = {
            'Content-Type': 'application/json'
        };

        if (socket && socket.id) {
            headers['x-socket-id'] = socket.id;
        }

        return headers;
    }

    function handleAuthError(response) {
        if (response.status === 401) {
            console.error("Session expirée ou invalide.");
            // On nettoie le flag local
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'auth.html'; 
            return true;
        }
        return false;
    }

    // [NOUVEAU] Helper pour fetch avec credentials (Cookies)
    /**
     * Effectue une requête fetch en incluant automatiquement les cookies.
     */
    async function fetchWithCredentials(url, options = {}) {
        const defaultOptions = {
            // [CRUCIAL] Dit au navigateur d'envoyer les cookies HttpOnly avec la requête
            credentials: 'include', 
        };
        
        // Fusion des options
        const finalOptions = { ...defaultOptions, ...options };
        
        // Si des headers sont fournis, on s'assure de ne pas écraser l'objet headers existant
        if (options.headers) {
            finalOptions.headers = { ...options.headers };
        }

        return fetch(url, finalOptions);
    }

    // --- Fonctions API "publiques" ---

    // [MODIFIÉ] Connexion Socket.io avec Cookies
    function connectSocket() {
        // Plus besoin de token dans auth
        socket = io(API_URL, {
            withCredentials: true, // [CRUCIAL] Pour que le handshake socket envoie les cookies
            // auth: { token: ... } // SUPPRIMÉ
        });

        socket.on('connect', () => {
            console.log('Socket connecté avec succès :', socket.id);
        });

        socket.on('connect_error', (err) => {
            console.error('Erreur de connexion socket :', err.message);
            if (err.message.includes('Authentification')) {
                handleAuthError({ status: 401 });
            }
        });

        socket.on('disconnect', () => {
            console.log('Socket déconnecté.');
        });
        
        return socket;
    }

    // [MODIFIÉ] Utilise fetchWithCredentials
    async function fetchUserPermissions() {
        try {
            const response = await fetchWithCredentials(`${API_URL}/api/auth/me`, {
                method: 'GET',
                headers: getAuthHeaders()
            });

            if (handleAuthError(response)) return;
            if (!response.ok) {
                throw new Error("Impossible de récupérer les informations utilisateur.");
            }
            return await response.json();
        } catch (err) {
            console.error(err);
            // Si erreur réseau ou autre, on redirige si on soupçonne une perte de session
            if (err.message.includes("401")) {
                window.location.href = 'auth.html';
            }
            throw err;
        }
    }

    async function fetchPatientList() {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type']; // Pas de body pour un GET

            const response = await fetchWithCredentials(`${API_URL}/api/patients`, { 
                method: 'GET',
                headers: headers 
            });
            
            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) {
            console.error("Erreur chargement liste:", err);
            throw err;
        }
    }

    async function fetchPatientData(patientId) {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];

            const response = await fetchWithCredentials(`${API_URL}/api/patients/${patientId}`, {
                method: 'GET',
                headers: headers
            });

            if (handleAuthError(response)) return;

            if (!response.ok) {
                if (response.status === 404) {
                    return {}; 
                } else {
                    throw new Error('Erreur réseau.');
                }
            }
            return await response.json();
        } catch (err) {
            console.error("Erreur chargement données:", err);
            return {};
        }
    }

    async function saveChamberData(patientId, dossierData, patientName) {
        if (!patientId || !patientId.startsWith('chambre_')) return;
        
        try {
            const headers = getAuthHeaders(); 
            const response = await fetchWithCredentials(`${API_URL}/api/patients/${patientId}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    dossierData: dossierData,
                    sidebar_patient_name: patientName || `Chambre ${patientId.split('_')[1]}`
                })
            });

            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) {
            console.error("Erreur sauvegarde:", err);
            throw err;
        }
    }

    async function saveCaseData(dossierData, patientName) {
        try {
            const headers = getAuthHeaders();
            const response = await fetchWithCredentials(`${API_URL}/api/patients/save`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    dossierData: dossierData,
                    sidebar_patient_name: patientName
                })
            });

            if (handleAuthError(response)) return;
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la sauvegarde');
            }
            return data;
        } catch (err) {
            console.error("Erreur sauvegarde cas:", err);
            throw err;
        }
    }
    
    async function deleteSavedCase(patientId) {
        if (!patientId || !patientId.startsWith('save_')) throw new Error("ID Invalide");
        
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];

            const response = await fetchWithCredentials(`${API_URL}/api/patients/${patientId}`, { 
                method: 'DELETE',
                headers: headers
            });

            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) {
            console.error("Erreur suppression:", err);
            throw err;
        }
    }

    async function clearAllChamberData(allChamberIds) {
        const headers = getAuthHeaders();
        const clearPromises = [];

        for (const patientId of allChamberIds) {
            const promise = fetchWithCredentials(`${API_URL}/api/patients/${patientId}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    dossierData: {},
                    sidebar_patient_name: `Chambre ${patientId.split('_')[1]}`
                })
            });
            clearPromises.push(promise);
        }

        try {
            return await Promise.all(clearPromises);
        } catch (err) {
             console.error("Erreur réinitialisation:", err);
             throw err;
        }
    }

    // [NOUVEAU] Fonction de Déconnexion
    async function logout() {
        try {
            // Appelle le backend pour supprimer le cookie
            await fetchWithCredentials(`${API_URL}/auth/logout`, { method: 'POST' });
        } catch (e) {
            console.error("Erreur logout réseau", e);
        } finally {
            // Nettoyage local et redirection
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'auth.html';
        }
    }

    // --- Exposition du service ---
    
    window.apiService = {
        connectSocket,
        fetchUserPermissions,
        fetchPatientList,
        fetchPatientData,
        saveChamberData,
        saveCaseData,
        deleteSavedCase,
        clearAllChamberData,
        logout
    };

})();