(function() {
    "use strict";

    const API_URL = 'https://eidos-api.onrender.com';
    let socket = null;

    function getAuthToken() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'auth.html'; 
            return null;
        }
        return token;
    }

    function getAuthHeaders() {
        const token = getAuthToken();
        if (!token) throw new Error("Token non trouvé.");
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        if (socket && socket.id) headers['x-socket-id'] = socket.id;
        return headers;
    }

    function handleAuthError(response) {
        if (response.status === 401) {
            localStorage.removeItem('authToken');
            window.location.href = 'auth.html'; 
            return true;
        }
        return false;
    }

    function connectSocket() {
        const token = getAuthToken();
        if (!token) return null;
        socket = io(API_URL, { auth: { token: token } });
        socket.on('connect_error', (err) => { if (err.message.includes('Authentification')) handleAuthError({ status: 401 }); });
        return socket;
    }

    async function fetchUserPermissions() {
        try {
            const token = getAuthToken();
            if (!token) return;
            const response = await fetch(`${API_URL}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur infos utilisateur.");
            return await response.json();
        } catch (err) { throw err; }
    }

    async function fetchPatientList() {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/patients`, { headers });
            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) { throw err; }
    }

    async function fetchPatientData(patientId) {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/patients/${patientId}`, { headers: headers });
            if (handleAuthError(response)) return;
            if (!response.ok) return {}; 
            return await response.json();
        } catch (err) { return {}; }
    }

    async function saveChamberData(patientId, dossierData, patientName) {
        if (!patientId || !patientId.startsWith('chambre_')) return;
        try {
            const headers = getAuthHeaders(); 
            if (!headers) return;
            const response = await fetch(`${API_URL}/api/patients/${patientId}`, {
                method: 'POST', headers: headers,
                body: JSON.stringify({ dossierData: dossierData, sidebar_patient_name: patientName || `Chambre ${patientId.split('_')[1]}` })
            });
            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) { throw err; }
    }

    async function saveCaseData(dossierData, patientName) {
        try {
            const headers = getAuthHeaders();
            if (!headers) return;
            const response = await fetch(`${API_URL}/api/patients/save`, {
                method: 'POST', headers: headers,
                body: JSON.stringify({ dossierData: dossierData, sidebar_patient_name: patientName })
            });
            if (handleAuthError(response)) return;
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erreur sauvegarde');
            return data;
        } catch (err) { throw err; }
    }
    
    async function deleteSavedCase(patientId) {
        if (!patientId || !patientId.startsWith('save_')) throw new Error("Suppression impossible.");
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            if (!headers) return;
            const response = await fetch(`${API_URL}/api/patients/${patientId}`, { method: 'DELETE', headers: headers });
            if (handleAuthError(response)) return;
            return await response.json();
        } catch (err) { throw err; }
    }

    async function clearAllChamberData(allChamberIds) {
        const headers = getAuthHeaders();
        if (!headers) return;
        const clearPromises = [];
        for (const patientId of allChamberIds) {
            const promise = fetch(`${API_URL}/api/patients/${patientId}`, {
                method: 'POST', headers: headers,
                body: JSON.stringify({ dossierData: {}, sidebar_patient_name: `Chambre ${patientId.split('_')[1]}` })
            });
            clearPromises.push(promise);
        }
        try { return await Promise.all(clearPromises); } catch (err) { throw err; }
    }

    // --- FONCTIONS ADMIN ---

    async function fetchAdminStats() {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/admin/stats`, { headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur stats");
            return await response.json();
        } catch (err) { throw err; }
    }

    async function fetchAdminData() {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/admin/data`, { headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur données admin");
            return await response.json();
        } catch (err) { throw err; }
    }

    async function adminDeleteUser(userId) {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE', headers: headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur suppression utilisateur");
            return await response.json();
        } catch (err) { throw err; }
    }

    // NOUVEAU : Suppression de scénario par l'admin
    async function adminDeleteScenario(patientId) {
        try {
            const headers = getAuthHeaders();
            delete headers['Content-Type'];
            const response = await fetch(`${API_URL}/api/admin/scenarios/${patientId}`, { method: 'DELETE', headers: headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur suppression scénario");
            return await response.json();
        } catch (err) { throw err; }
    }

    async function toggleScenarioPublic(patientId) {
        try {
            const headers = getAuthHeaders();
            const response = await fetch(`${API_URL}/api/admin/scenarios/${patientId}/toggle-public`, { method: 'PUT', headers: headers });
            if (handleAuthError(response)) return;
            if (!response.ok) throw new Error("Erreur visibilité");
            return await response.json();
        } catch (err) { throw err; }
    }

    window.apiService = {
        connectSocket,
        fetchUserPermissions,
        fetchPatientList,
        fetchPatientData,
        saveChamberData,
        saveCaseData,
        deleteSavedCase,
        clearAllChamberData,
        fetchAdminStats,
        fetchAdminData,
        adminDeleteUser,
        adminDeleteScenario, // Export de la nouvelle fonction
        toggleScenarioPublic
    };

})();