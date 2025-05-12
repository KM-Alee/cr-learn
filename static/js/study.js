// static/js/study.js
document.addEventListener("DOMContentLoaded", () => {
    const flashcardElement = document.getElementById("flashcard");
    const cardFrontElement = document.getElementById("card-front");
    const cardBackElement = document.getElementById("card-back");
    const progressBar = document.querySelector(".study-progress .progress");
    const cardCounterElement = document.getElementById("card-counter");
    const deckTitleElement = document.getElementById("deck-title");
    const difficultyButtons = document.querySelectorAll(".study-controls .control-btn");
    const deckSelectElement = document.getElementById("deck-select");

    let studyCards = [];
    let currentCardIndex = 0;
    let currentDeckId = null;

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }

    const urlParams = new URLSearchParams(window.location.search);
    currentDeckId = urlParams.get('deck_id');

    if (!currentDeckId) {
        cardFrontElement.innerHTML = "<p>Select a deck to begin.</p>";
        cardBackElement.innerHTML = "<p>Choose a deck from the dropdown above.</p>";
        cardCounterElement.textContent = "";
        progressBar.style.width = "0%";
        document.querySelector('.study-controls').style.display = 'none';
        deckTitleElement.textContent = "NeuroFlash Study";
        populateDeckSelector();
        return;
    }

    async function fetchStudyCards(deckId) {
        cardFrontElement.innerHTML = "<p>Loading cards...</p>";
        cardBackElement.innerHTML = "";
        cardCounterElement.textContent = "Loading...";
        progressBar.style.width = "0%";
        document.querySelector('.study-controls').style.display = 'none';

        try {
            const response = await fetch(`/api/study/session/${deckId}`);
            if (!response.ok) {
                if (response.status === 401) { window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname + window.location.search); return; }
                if (response.status === 404) { throw new Error('Deck not found or no study cards available.'); }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success && result.cards) {
                studyCards = result.cards;
                if (studyCards.length === 0) {
                    cardFrontElement.innerHTML = "<p>No cards due for study in this deck right now!</p>";
                    cardBackElement.innerHTML = "<p>Check back later or add more cards.</p>";
                    cardCounterElement.textContent = "0 cards";
                    progressBar.style.width = "100%";
                    document.querySelector('.study-controls').style.display = 'none';
                } else {
                    currentCardIndex = 0;
                    loadCard(studyCards[currentCardIndex]);
                    document.querySelector('.study-controls').style.display = 'flex';
                }
                fetchDeckName(deckId);
            } else {
               cardFrontElement.innerHTML = `<p>Error loading cards: ${result.errors?.general || 'Unknown error'}</p>`;
               document.querySelector('.study-controls').style.display = 'none';
            }
        } catch (error) {
            console.error("Failed to fetch study cards:", error);
            cardFrontElement.innerHTML = `<p>Error loading cards: ${error.message}</p>`;
            document.querySelector('.study-controls').style.display = 'none';
        }
    }
  
    async function fetchDeckName(deckId) {
       try {
          const response = await fetch(`/api/decks/${deckId}`);
           if (!response.ok) {
               console.error("Failed to fetch deck name, status:", response.status);
               deckTitleElement.textContent = `Deck ID: ${deckId}`;
               return;
           }
           const result = await response.json();
           if (result.success && result.deck && result.deck.name) {
                deckTitleElement.textContent = result.deck.name;
           } else {
               console.warn("Deck name not found in API response for specific deck.");
               deckTitleElement.textContent = `Deck ID: ${deckId}`;
           }
       } catch (error) {
           console.error("Error fetching deck name:", error);
           deckTitleElement.textContent = `Deck ID: ${deckId}`;
       }
    }

    function loadCard(cardData) {
        flashcardElement.classList.remove("flipped");
        cardFrontElement.innerHTML = `<p>${escapeHtml(cardData.front)}</p>`;
        cardBackElement.innerHTML = `<p>${escapeHtml(cardData.back)}</p>`;
        cardCounterElement.textContent = `Card ${currentCardIndex + 1} of ${studyCards.length}`;
        progressBar.style.width = `${((currentCardIndex + 1) / studyCards.length) * 100}%`;
        flashcardElement.dataset.flashcardId = cardData.flashcard_id;
    }
    
    flashcardElement.addEventListener("click", () => flashcardElement.classList.toggle("flipped"));

    difficultyButtons.forEach((btn) => {
        btn.addEventListener("click", async (event) => {
            const buttonElement = event.target.closest('button');
            const rating = buttonElement.getAttribute("data-difficulty");
            const flashcardId = flashcardElement.dataset.flashcardId;

            if (!flashcardId || !rating) {
                alert("Error: Cannot submit review. Missing data.");
                return;
            }

            difficultyButtons.forEach(b => b.disabled = true);
            await submitReview(flashcardId, rating);
            difficultyButtons.forEach(b => b.disabled = false);
        });
    });

    async function submitReview(flashcardId, ratingString) {
        try {
            const response = await fetch(`/api/study/review/${flashcardId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ rating: ratingString }),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                currentCardIndex++;
                if (currentCardIndex < studyCards.length) {
                    loadCard(studyCards[currentCardIndex]);
                } else {
                    cardCounterElement.textContent = `Completed ${studyCards.length} cards!`;
                    progressBar.style.width = "100%";
                    flashcardElement.classList.remove('flipped');
                    cardFrontElement.innerHTML = `
                        <div style="text-align: center; padding: 20px;">
                            <h2>Session Complete!</h2>
                            <p>You've reviewed all cards in this batch. Great job!</p>
                            <p style="margin-top: 15px;">Select another deck above to continue studying.</p>
                             <button class="btn secondary-btn" id="backToDashboardBtn" style="margin-top: 10px;">Back to Dashboard</button>
                        </div>`;
                    cardBackElement.innerHTML = "";
                    document.querySelector('.study-controls').style.display = 'none';
                    
                    if (deckSelectElement) {
                        deckSelectElement.focus();
                        if (typeof deckSelectElement.showPicker === 'function') {
                            deckSelectElement.showPicker();
                        } else {
                            console.log("Select dropdown focused.");
                        }
                    }
                    document.getElementById('backToDashboardBtn').addEventListener('click', () => {
                        window.location.href = '/dashboard';
                    });
                }
            } else {
                console.error("Error submitting review:", result);
                alert(`Error submitting review: ${result.errors?.general || result.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Failed to submit review (catch):", error);
            alert("An unexpected error occurred while submitting the review.");
        }
    }

    async function populateDeckSelector() {
        try {
            const response = await fetch('/api/decks');
            if (!response.ok) {
                 console.error("Failed to fetch decks for selector");
                 // Keep existing 'Select a deck...' option if fetch fails
                 return;
            }
            const result = await response.json();
            if (result.success && result.decks) {
                deckSelectElement.innerHTML = '<option value="">Select another deck...</option>';
                result.decks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.id;
                    option.textContent = deck.name;
                    if (currentDeckId && deck.id.toString() === currentDeckId) {
                        option.selected = true;
                    }
                    deckSelectElement.appendChild(option);
                });
                 // If a deck was specified in the URL but not found in the user's decks,
                 // the dropdown will just show "Select another deck..."
            }
        } catch (error) { console.error("Error populating deck selector:", error); }
    }

    if (currentDeckId) {
        deckTitleElement.textContent = "Loading Deck...";
        cardCounterElement.textContent = "Loading...";
        populateDeckSelector();
        fetchStudyCards(currentDeckId);
    } else {
        deckTitleElement.textContent = "NeuroFlash Study"; // Default title when no deck is selected
        cardCounterElement.textContent = "";
        progressBar.style.width = "0%";
        document.querySelector('.study-controls').style.display = 'none';
        populateDeckSelector();
    }
    
    deckSelectElement.addEventListener("change", (event) => {
      const selectedDeckId = event.target.value;
      if (selectedDeckId) {
           window.location.href = `/study?deck_id=${selectedDeckId}`;
      }
    });

    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          flashcardElement.classList.toggle("flipped");
        } else if (flashcardElement.classList.contains("flipped")) {
            let difficultyToClick = null;
            if (e.key === "1" || e.key.toLowerCase() === "h") difficultyToClick = "hard";
            else if (e.key === "2" || e.key.toLowerCase() === "g") difficultyToClick = "good";
            else if (e.key === "3" || e.key.toLowerCase() === "e") difficultyToClick = "easy";
            
            if (difficultyToClick) {
                e.preventDefault();
                const button = document.querySelector(`.study-controls .control-btn[data-difficulty="${difficultyToClick}"]`);
                if (button) button.click();
            }
        }
    });
});