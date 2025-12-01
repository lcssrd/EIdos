(function() {
    "use strict";

    // MODIFICATION 1 : L'URL de l'API est vide pour utiliser le proxy Vercel (Current Domain)
    const API_URL = ''; 
    
    // MODIFICATION 2 : URL spécifique pour les Sockets (Connexion directe obligatoire)
    const SOCKET_URL = 'https://api.eidos-simul.fr';

    // Variable pour stocker la connexion socket
    let socket = null;

    // --- Fonctions d'authentification "privées" ---

    function getAuthToken() {
        return localStorage.getItem('isLoggedIn') === 'true';
    }

    function getAuthHeaders() {
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
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'auth.html'; 
            return true;
        }
        return false;
    }

    // Helper pour fetch avec credentials (Cookies)
    async function fetchWithCredentials(url, options = {}) {
        const defaultOptions = {
            credentials: 'include', 
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        if (options.headers) {
            finalOptions.headers = { ...options.headers };
        }

        return fetch(url, finalOptions);
    }

    // --- Fonctions API "publiques" ---

    function connectSocket() {
        // MODIFICATION 3 : Utilisation de SOCKET_URL au lieu de API_URL
        socket = io(SOCKET_URL, {
            withCredentials: true, 
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
            if (err.message.includes("401")) {
                window.location.href = 'auth.html';
            }
            throw err;
        }
    }

    async function fetchPatientList() {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type']; 

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

    async function logout() {
        try {
            await fetchWithCredentials(`${API_URL}/auth/logout`, { method: 'POST' });
        } catch (e) {
            console.error("Erreur logout réseau", e);
        } finally {
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