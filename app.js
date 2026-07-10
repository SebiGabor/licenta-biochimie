const DB_KEY = 'biochimie_app_data';

const defaultState = {
    history: [],
    training: {
        currentIteration: 1,
        answeredIds: [],
        wrongStats: {} // format: { questionId: { count: N, iterations: [1, 2] } }
    }
};

class App {
    constructor() {
        this.grile = [];
        this.state = this.loadState();
        this.currentView = 'home';
        this.currentQuiz = null;

        this.init();
    }

    async init() {
        try {
            const response = await fetch('Grile.json');
            this.grile = await response.json();
            this.render();
        } catch (error) {
            document.getElementById('app-content').innerHTML = '<div class="card">Eroare la încărcarea Grile.json. Asigură-te că rulezi site-ul pe un server (ex: Live Server sau GitHub Pages), nu direct din file://</div>';
        }
    }

    loadState() {
        const saved = localStorage.getItem(DB_KEY);
        return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(defaultState));
    }

    saveState() {
        localStorage.setItem(DB_KEY, JSON.stringify(this.state));
    }

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

    // --- VIEWS ---

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
                        Statistici & Sincronizare
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
            
            <div class="sync-box">
                <h3>Sincronizare Dispozitive</h3>
                <p style="font-size: 0.9rem; margin-bottom: 0.5rem;">Copiați codul de mai jos pentru a muta progresul pe alt dispozitiv.</p>
                <button class="secondary" onclick="app.exportData()">Generează Cod Export</button>
                <textarea id="syncData" placeholder="Lipește aici codul de import..."></textarea>
                <button onclick="app.importData()">Importă Date</button>
            </div>
        `;
    }

    // --- QUIZ ENGINE ---

    initQuiz(container, params) {
        let questions = [];
        let totalTime = 0; // seconds

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
            totalTime = null; // no timer for training
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

        // Disable clicks
        document.querySelectorAll('.option').forEach(el => el.classList.add('disabled'));
        document.getElementById(`opt-${selectedKey}`).onclick = null;

        // Visual feedback
        document.getElementById(`opt-${q.raspuns_corect}`).classList.add('correct');
        if (!isCorrect) {
            document.getElementById(`opt-${selectedKey}`).classList.add('wrong');
        } else {
            qz.correctCount++;
        }

        // Logic for Training
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

    // --- UTILS ---

    resetTraining() {
        if (confirm('Ești sigur că vrei să resetezi complet progresul antrenamentului curent? Istoricul greșelilor se va păstra, dar vei relua iterația curentă de la zero.')) {
            this.state.training.answeredIds = [];
            this.saveState();
            this.render();
        }
    }

    exportData() {
        const data = btoa(JSON.stringify(this.state));
        document.getElementById('syncData').value = data;
    }

    importData() {
        const input = document.getElementById('syncData').value.trim();
        if (!input) return;
        try {
            const parsed = JSON.parse(atob(input));
            if (parsed && parsed.training) {
                this.state = parsed;
                this.saveState();
                alert('Date sincronizate cu succes!');
                this.render();
            }
        } catch (e) {
            alert('Cod invalid. Sincronizarea a eșuat.');
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

// Inițializare aplicație
const app = new App();