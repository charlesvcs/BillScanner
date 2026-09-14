import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// Éléments du DOM
const cameraInput = document.getElementById('camera-input');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const progressBar = document.getElementById('progress-bar');
const resultContainer = document.getElementById('result-container');
const resMagasin = document.getElementById('res-magasin');
const resDate = document.getElementById('res-date');
const resArticles = document.getElementById('res-articles');
const resTotal = document.getElementById('res-total');
const historyList = document.getElementById('history-list');

// Configuration du Modèle (Choix ultra léger pour iOS)
const SELECTED_MODEL = "SmolLM2-135M-Instruct-q4f16_1-MLC";
let engine = null;

// Enregistrement du Service Worker pour la PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW Registration failed:", err));
    });
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
});

// Gestionnaire de capture d'image
cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Réinitialiser l'UI
    resultContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    
    try {
        // Étape 1 : OCR
        updateStatus("Analyse de l'image (OCR)...", 10);
        const textOcr = await performOCR(file);
        
        if (!textOcr || textOcr.trim().length < 5) {
            throw new Error("Texte illisible ou image floue.");
        }

        // Étape 2 : Chargement du modèle LLM
        if (!engine) {
            updateStatus("Chargement de l'IA (peut prendre du temps la 1ère fois)...", 30);
            engine = await CreateMLCEngine(SELECTED_MODEL, {
                initProgressCallback: (progress) => {
                    // La progression de WebLLM va de 0 à 1
                    const p = Math.round(progress.progress * 100);
                    updateStatus(`Mise en cache du modèle IA : ${p}%`, 30 + (p * 0.4));
                }
            });
        }

        // Étape 3 : Parsing LLM
        updateStatus("Extraction des données structurées...", 80);
        const jsonResult = await parseTextWithLLM(textOcr);
        
        updateStatus("Terminé !", 100);
        setTimeout(() => statusContainer.classList.add('hidden'), 1000);

        // Affichage et Sauvegarde
        displayResult(jsonResult);
        saveToHistory(jsonResult);

    } catch (error) {
        console.error(error);
        updateStatus(`Erreur : ${error.message}`, 100);
        progressBar.classList.add('bg-red-500');
    }
});

// Fonction OCR via Tesseract.js
async function performOCR(imageFile) {
    const worker = await Tesseract.createWorker('fra');
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();
    return text;
}

// Fonction de Parsing via WebLLM
async function parseTextWithLLM(rawText) {
    const systemPrompt = `Tu es un extracteur de données. Analyse le ticket de caisse suivant et retourne UNIQUEMENT un objet JSON valide, sans markdown, sans introduction, avec cette structure exacte :
{
  "magasin": "Nom du magasin",
  "date": "JJ/MM/AAAA",
  "total": 0.00,
  "articles": [
    { "nom": "Nom de l'article", "prix": 0.00 }
  ]
}
Si un champ est introuvable, mets null.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawText }
    ];

    const reply = await engine.chat.completions.create({
        messages,
        temperature: 0.1, // Température basse pour plus de déterminisme
    });

    let rawJsonStr = reply.choices[0].message.content;
    
    // Nettoyage de la réponse (au cas où le LLM ajouterait des balises de code)
    rawJsonStr = rawJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(rawJsonStr);
    } catch (e) {
        throw new Error("L'IA n'a pas pu formater correctement les données.");
    }
}

// Met à jour l'interface utilisateur avec le JSON
function displayResult(data) {
    resMagasin.textContent = data.magasin || "Inconnu";
    resDate.textContent = data.date || "--/--/----";
    resTotal.textContent = `${data.total ? data.total.toFixed(2) : '0.00'} €`;
    
    resArticles.innerHTML = '';
    if (data.articles && data.articles.length > 0) {
        data.articles.forEach(art => {
            const li = document.createElement('li');
            li.className = "flex justify-between border-b border-gray-700/50 pb-1";
            li.innerHTML = `<span>${art.nom || 'Article'}</span> <span>${art.prix ? art.prix.toFixed(2) : '0.00'} €</span>`;
            resArticles.appendChild(li);
        });
    } else {
        resArticles.innerHTML = '<li class="text-gray-500 italic">Aucun article détecté</li>';
    }

    resultContainer.classList.remove('hidden');
}

function updateStatus(text, percent) {
    statusText.textContent = text;
    progressBar.style.width = `${percent}%`;
    progressBar.classList.remove('bg-red-500');
}

// Gestion du LocalStorage pour l'historique
function saveToHistory(data) {
    let history = JSON.parse(localStorage.getItem('receipt_history')) || [];
    // Ajouter un ID et une date de scan
    data.id = Date.now();
    data.scannedAt = new Date().toLocaleString('fr-FR');
    
    history.unshift(data); // Ajouter au début
    if (history.length > 10) history.pop(); // Garder seulement les 10 derniers
    
    localStorage.setItem('receipt_history', JSON.stringify(history));
    loadHistory();
}

function loadHistory() {
    let history = JSON.parse(localStorage.getItem('receipt_history')) || [];
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = '<p class="text-sm text-gray-500 italic">Aucun ticket scanné pour le moment.</p>';
        return;
    }

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = "bg-gray-800 p-3 rounded-lg border border-gray-700 flex justify-between items-center";
        div.innerHTML = `
            <div>
                <p class="font-semibold text-gray-200">${item.magasin || 'Inconnu'}</p>
                <p class="text-xs text-gray-500">${item.date || item.scannedAt}</p>
            </div>
            <div class="font-bold text-blue-400">
                ${item.total ? item.total.toFixed(2) : '0.00'} €
            </div>
        `;
        historyList.appendChild(div);
    });
}
