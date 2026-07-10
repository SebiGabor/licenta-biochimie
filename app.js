const supabaseUrl = 'https://reoxcxirvtmoexwgayoq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlb3hjeGlydnRtb2V4d2dheW9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTgzNDcsImV4cCI6MjA5OTI3NDM0N30.HvoX0VHDeWWDssrCo_duxYnciLhq1ZLjKWa6VZU9JMo';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const DB_KEY = 'biochimie_app_data';
const RECORD_ID = 'progres_unic'; // ID-ul fix folosit pentru salvarea datelor s妹

const defaultState = {
    history: [],
    training: {
        currentIteration: 1,
        answeredIds: [],
        wrongStats: {}
    }
};

class App {
    constructor() {
        this.grile = [];
        this.state = JSON.parse(JSON.stringify(defaultState));
        this.currentView = 'loading';
        this.currentQuiz = null;

        this.init();
    }

    async init() {
        try {
            // 1. Încărcăm grilele din JSON
            const response = await fetch('Grile.json');
            this.grile = await response.json();

            // 2. Încărcăm direct progresul din cloud
            await this.loadStateFromCloud();

            // 3. Mergem direct pe pagina principală
            this.navigate('home');
        } catch (error) {
            document.getElementById('app-content').innerHTML = '<div class="card">Eroare la pornirea aplicației. Verificați conexiunea la internet.</div>';
        }
    }

    // --- CLOUD SYNC SIMPLIFICAT ---

    async loadStateFromCloud() {
        try {
            const { data, error } = await supabaseClient
                .from('user_sync')
                .select('state_data')
                .eq('id', RECORD_ID)
                .maybeSingle(); // Returnează null dacă rândul nu există încă

            if (data && data.state_data) {
                this.state = data.state_data;
            } else {
                // Dacă e prima rulare absolută și nu există în cloud, verificăm dacă are ceva salvat local în browser
                const localSaved = localStorage.getItem(DB_KEY);
                this.state = localSaved ? JSON.parse(localSaved) : JSON.parse(JSON.stringify(defaultState));
                this.saveState(); // Creăm rândul în cloud
            }
        } catch (e) {
            console.error("Eroare la citirea din cloud, trecem pe salvare locală:", e);
            const localSaved = localStorage.getItem(DB_KEY);
            this.state = localSaved ? JSON.parse(localSaved) : JSON.parse(JSON.stringify(defaultState));
        }
    }

    saveState() {
        // Salvare rapidă locală în browser (cache în caz de offline temporar)
        localStorage.setItem(DB_KEY, JSON.stringify(this.state));

        // Actualizare asincronă în baza de date cloud
        supabaseClient.from('user_sync').upsert({
            id: RECORD_ID,
            state_data: this.state,
            updated_at: new Date()
        }).then(({error}) => {
            if(error) console.error("Eroare la sincronizarea în cloud:", error);
        });
    }

    // --- NAVIGARE ȘI VEDERI ---

    navigate(view, params = {}) {
        this.currentView = view;
        this.render(params);
    }

    render(params = {}) {
        const container = document.getElementById('app-content');
        container.innerHTML = '';

        if (this.currentView === 'home') container.innerHTML = this.viewHome();
        else if (this.currentView === 'quizSetup') container.innerHTML = this.viewQuizSetup();
        else if (this.currentView === 'quiz') this.initQuiz(container, params);
        else if (this.currentView === 'statistici') container.innerHTML = this.viewStats();
    }

    viewHome() {
        return `
            <div class="card">
                <h2>Examen Licență Biochimie</h2>
                <p>Bază de date curentă: <strong>${this.grile.length}</strong> grile.</p>
                
                <div class="grid-buttons">
                    <button onclick="app.navigate('quiz', { type: 'simulare', count: 100 })">
                        Simulare (100 grile / 180 min)
                    </button>
                    <button class="secondary" onclick="app.navigate('quizSetup')">
                        Simulare Personalizată
                    </button>
                    <button class="secondary" onclick="app.navigate('quiz', { type: 'antrenament' })">
                        Antrenament (${this.state.training.answeredIds.length}/${this.grile.length})
                    </button>
                    <button class="secondary" onclick="app.navigate('statistici')">
                        Statistici & Progres
                    </button>
                </div>
            </div>
        `;
    }

    viewQuizSetup() {
        return `
            <div class="card">
                <h2>Simulare Personalizată</h2>
                <br>
                <label>Număr întrebări (max ${this.grile.length}):</label>
                <input type="number" id="customCount" value="50" min="1" max="${this.grile.length}" style="padding:0.5rem; margin-top:0.5rem; width:100%;">
                <div class="controls">
                    <button class="secondary" onclick="app.navigate('home')">Înapoi</button>
                    <button onclick="app.startCustomQuiz()">Start Simulare</button>
                </div>
            </div>
        `;
    }

    startCustomQuiz() {
        let count = parseInt(document.getElementById('customCount').value);
        if (isNaN(count) || count < 1) count = 1;
        if (count > this.grile.length) count = this.grile.length;
        this.navigate('quiz', { type: 'custom', count: count });
    }

    viewStats() {
        let historyHtml = this.state.history.length === 0 ? '<p>Nu există simulări finalizate.</p>' : `
            <table>
                <tr><th>Data</th><th>Tip</th><th>Scor</th><th>Timp</th></tr>
                ${this.state.history.slice().reverse().map(h => `
                    <tr>
                        <td>${new Date(h.date).toLocaleString('ro-RO')}</td>
                        <td>${h.type === 'simulare' ? 'Standard' : 'Personalizat'}</td>
                        <td>${h.score.toFixed(2)} / 100 (${h.correct}/${h.total})</td>
                        <td>${h.timeSpent}</td>
                    </tr>
                `).join('')}
            </table>
        `;

        let wrongStatsHtml = Object.keys(this.state.training.wrongStats).length === 0 ? '<p>Nu ai greșit nicio întrebare la antrenament.</p>' : `
            <table>
                <tr><th>Nr. Întrebare</th><th>Greșeli</th><th>Iterații (Antrenament)</th></tr>
                ${Object.entries(this.state.training.wrongStats)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([id, data]) => `
                    <tr>
                        <td>Grila ${id}</td>
                        <td>${data.count}</td>
                        <td>${[...new Set(data.iterations)].join(', ')}</td>
                    </tr>
                `).join('')}
            </table>
        `;

        return `
            <div class="card">
                <h2>Statistici Simulări</h2>
                ${historyHtml}
            </div>
            <div class="card">
                <h2>Istoric Greșeli (Antrenament)</h2>
                <p style="color:var(--text-muted); font-size:0.9rem;">Iterația curentă: ${this.state.training.currentIteration}</p>
                ${wrongStatsHtml}
                <div style="margin-top: 1rem;">
                     <button class="danger" onclick="app.resetTraining()">Resetare Antrenament</button>
                </div>
            </div>
        `;
    }

    // --- QUIZ ENGINE ---

    initQuiz(container, params) {
        let questions = [];
        let totalTime = 0;

        if (params.type === 'antrenament') {
            const available = this.grile.filter(g => !this.state.training.answeredIds.includes(g.numar_intrebare));
            if (available.length === 0) {
                this.state.training.currentIteration++;
                this.state.training.answeredIds = [];
                this.saveState();
                alert(`Felicitări! Ai terminat toate întrebările. Treci la iterația de antrenament nr. ${this.state.training.currentIteration}.`);
                this.navigate('home');
                return;
            }
            questions = this.shuffleArray(available);
            totalTime = null;
        } else {
            questions = this.shuffleArray([...this.grile]).slice(0, params.count);
            totalTime = (params.count * 180 / 100) * 60;
        }

        this.currentQuiz = {
            type: params.type,
            questions: questions,
            currentIndex: 0,
            correctCount: 0,
            totalTime: totalTime,
            timeRemaining: totalTime,
            timerInterval: null
        };

        if (totalTime) {
            this.currentQuiz.timerInterval = setInterval(() => {
                this.currentQuiz.timeRemaining--;
                const timerEl = document.getElementById('quiz-timer');
                if (timerEl) timerEl.innerText = this.formatTime(this.currentQuiz.timeRemaining);
                if (this.currentQuiz.timeRemaining <= 0) this.endQuiz();
            }, 1000);
        }

        this.renderQuestion();
    }

    renderQuestion() {
        const qz = this.currentQuiz;
        const container = document.getElementById('app-content');

        if (qz.currentIndex >= qz.questions.length) {
            this.endQuiz();
            return;
        }

        const q = qz.questions[qz.currentIndex];

        let timerHtml = qz.totalTime ? `<span id="quiz-timer">${this.formatTime(qz.timeRemaining)}</span>` : `<span>Mod Antrenament (Iterația ${this.state.training.currentIteration})</span>`;

        container.innerHTML = `
            <div class="card">
                <div class="stats-bar">
                    <span>Întrebarea ${qz.currentIndex + 1} / ${qz.questions.length}</span>
                    ${timerHtml}
                </div>
                <div class="question-text">${q.numar_intrebare}. ${q.enunt}</div>
                <div class="options" id="options-container">
                    ${Object.entries(q.variante).map(([key, text]) => `
                        <div class="option" onclick="app.selectAnswer('${key}')" id="opt-${key}">
                            <strong>${key}.</strong> ${text}
                        </div>
                    `).join('')}
                </div>
                <div class="controls">
                    <button class="secondary" onclick="app.endQuiz(true)">Abandonează</button>
                    <button id="next-btn" style="display:none;" onclick="app.renderQuestion()">Următoarea</button>
                </div>
            </div>
        `;
    }

    selectAnswer(selectedKey) {
        const qz = this.currentQuiz;
        const q = qz.questions[qz.currentIndex];
        const isCorrect = selectedKey === q.raspuns_corect;

        document.querySelectorAll('.option').forEach(el => el.classList.add('disabled'));
        document.getElementById(`opt-${selectedKey}`).onclick = null;

        document.getElementById(`opt-${q.raspuns_corect}`).classList.add('correct');
        if (!isCorrect) {
            document.getElementById(`opt-${selectedKey}`).classList.add('wrong');
        } else {
            qz.correctCount++;
        }

        if (qz.type === 'antrenament') {
            this.state.training.answeredIds.push(q.numar_intrebare);
            if (!isCorrect) {
                if (!this.state.training.wrongStats[q.numar_intrebare]) {
                    this.state.training.wrongStats[q.numar_intrebare] = { count: 0, iterations: [] };
                }
                this.state.training.wrongStats[q.numar_intrebare].count++;
                this.state.training.wrongStats[q.numar_intrebare].iterations.push(this.state.training.currentIteration);
            }
            this.saveState();
        }

        document.getElementById('next-btn').style.display = 'block';
        qz.currentIndex++;
    }

    endQuiz(abandoned = false) {
        const qz = this.currentQuiz;
        if (qz.timerInterval) clearInterval(qz.timerInterval);

        if (qz.type !== 'antrenament' && !abandoned) {
            const timeSpentSecs = qz.totalTime - qz.timeRemaining;
            const scoreOut100 = (qz.correctCount / qz.questions.length) * 100;

            this.state.history.push({
                date: new Date().toISOString(),
                type: qz.type,
                total: qz.questions.length,
                correct: qz.correctCount,
                score: scoreOut100,
                timeSpent: this.formatTime(timeSpentSecs)
            });
            this.saveState();

            document.getElementById('app-content').innerHTML = `
                <div class="card" style="text-align:center;">
                    <h2>Simulare Finalizată</h2>
                    <h1 style="font-size: 3rem; color: var(--primary); margin: 1rem 0;">${scoreOut100.toFixed(2)}</h1>
                    <p>Ai răspuns corect la <strong>${qz.correctCount}</strong> din <strong>${qz.questions.length}</strong> întrebări.</p>
                    <p>Timp scurs: ${this.formatTime(timeSpentSecs)}</p>
                    <button style="margin-top: 2rem;" onclick="app.navigate('home')">Înapoi Acasă</button>
                </div>
            `;
        } else {
            this.navigate('home');
        }

        this.currentQuiz = null;
    }

    resetTraining() {
        if (confirm('Ești sigur că vrei să resetezi complet progresul antrenamentului curent?')) {
            this.state.training.answeredIds = [];
            this.saveState();
            this.render();
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

const app = new App();