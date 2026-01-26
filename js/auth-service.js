import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, doc, setDoc, getDoc } from './firebase-config.js';
import { store } from './store.js';

class AuthService {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        // Monitor auth state changes
        onAuthStateChanged(auth, (user) => {
            this.user = user;
            this.updateUI(user);

            if (user) {
                this.loadUserData(user.uid);
                // Setup sync listener
                store.setPersistenceCallback(this.saveUserData.bind(this));
            } else {
                store.setPersistenceCallback(null); // Disable sync
            }
        });

        // Add event listeners for login buttons if they exist
        this.setupEventListeners();
    }

    setupEventListeners() {
        const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const loginGoogleBtn = document.getElementById('loginGoogleBtn');

        if (loginBtn) loginBtn.addEventListener('click', () => {
            // Open Login Modal (implemented in UI)
            document.getElementById('authModal').classList.remove('hidden');
        });

        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        if (loginGoogleBtn) loginGoogleBtn.addEventListener('click', () => this.loginWithGoogle());

        // Close modal logic handled generally or here
        const closeAuthBtn = document.getElementById('closeAuthModal');
        if (closeAuthBtn) {
            closeAuthBtn.addEventListener('click', () => {
                document.getElementById('authModal').classList.add('hidden');
            });
        }
    }

    async loginWithGoogle() {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            // Modal closes on auth state change or manually here
            document.getElementById('authModal').classList.add('hidden');
            console.log("Logged in as", user.email);
        } catch (error) {
            console.error("Login failed", error);
            alert("Erro ao fazer login: " + error.message);
        }
    }

    async logout() {
        try {
            await signOut(auth);
            console.log("Logged out");
            // Optional: clear local state or reload
            window.location.reload();
        } catch (error) {
            console.error("Logout failed", error);
        }
    }

    async loadUserData(userId) {
        try {
            const docRef = doc(db, "users", userId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                console.log("Loading cloud data...");
                const data = docSnap.data();
                if (data.gestorData) {
                    store.loadFromPersistence(data.gestorData);
                }
            } else {
                console.log("No cloud data found. Syncing local data to cloud.");
                this.saveUserData(store.getDataForPersistence());
            }
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    }

    async saveUserData(data) {
        if (!this.user) return;

        try {
            await setDoc(doc(db, "users", this.user.uid), {
                gestorData: data,
                lastUpdated: new Date()
            }, { merge: true });

            // Visual feedback could be added here (e.g., "Saved")
            const savedIndicator = document.getElementById('savedIndicator');
            if (savedIndicator) {
                savedIndicator.classList.remove('opacity-0');
                setTimeout(() => savedIndicator.classList.add('opacity-0'), 2000);
            }
            console.log("Data synced to cloud");
        } catch (error) {
            console.error("Error saving user data:", error);
        }
    }

    updateUI(user) {
        const loginBtn = document.getElementById('loginBtn');
        const userProfileArea = document.getElementById('userProfileArea');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userAvatar = document.getElementById('userAvatar');

        if (user) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userProfileArea) userProfileArea.classList.remove('hidden');
            if (userNameDisplay) userNameDisplay.textContent = user.displayName || user.email;
            if (userAvatar) userAvatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + (user.displayName || 'User');
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userProfileArea) userProfileArea.classList.add('hidden');
        }
    }
}

export const authService = new AuthService();
