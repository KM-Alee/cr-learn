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
    let currentDeckId = null; // This will now be updated by the dropdown listener

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }

    // Get initial deck_id from URL (still needed for direct link/refresh)
    const urlParams = new URLSearchParams(window.location.search);
    const initialDeckIdFromUrl = urlParams.get('deck_id');

    // --- Fetch Study Cards ---
    async function fetchStudyCards(deckId) {
        console.log("fetchStudyCards called for deck ID:", deckId); // Log which deck ID is being fetched

        // Update global state BEFORE fetch completes, so UI reflects *attempt* to load new deck
        currentDeckId = deckId;
        currentCardIndex = 0; // Reset index for new deck
        studyCards = []; // Clear previous cards


        // Reset UI to loading state
        if (deckTitleElement) deckTitleElement.textContent = "Loading Deck...";
        if (cardCounterElement) cardCounterElement.textContent = "Loading...";
        if (progressBar) progressBar.style.width = "0%";
        if (flashcardElement) {
             flashcardElement.classList.remove("flipped");
             cardFrontElement.innerHTML = "<p>Loading cards...</p>";
             cardBackElement.innerHTML = "";
        }
         // Hide controls while loading
         if (document.querySelector('.study-controls')) document.querySelector('.study-controls').style.display = 'none';


        try {
            const response = await fetch(`/api/study/session/${deckId}`);
            console.log("API Response Status (Study Session):", response.status);

            if (!response.ok) {
                if (response.status === 401) {
                     // Redirect to login, preserving the current path/query (including the new deck_id if present)
                    window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname + (deckId ? `?deck_id=${deckId}` : ''));
                    return;
                }
                // Handle 404 or other errors specific to this fetch
                const errorText = response.status === 404 ? 'Deck not found or no study cards available.' : `HTTP error! status: ${response.status}`;
                 throw new Error(errorText);
            }
            const result = await response.json();
            console.log("API Result (Study Session):", result);

            if (result.success && result.cards) {
                studyCards = result.cards;
                console.log("Fetched Study Cards:", studyCards);

                if (studyCards.length === 0) {
                    cardFrontElement.innerHTML = "<p>No cards due for study in this deck right now!</p>";
                    cardBackElement.innerHTML = "<p>Check back later or add more cards.</p>";
                    cardCounterElement.textContent = "0 cards";
                    progressBar.style.width = "100%";
                    document.querySelector('.study-controls').style.display = 'none';
                } else {
                    currentCardIndex = 0; // Ensure index is 0 for a new batch
                    loadCard(studyCards[currentCardIndex]);
                    document.querySelector('.study-controls').style.display = 'flex';
                }
                // Fetch deck name after successful card fetch
                fetchDeckName(deckId);

            } else {
               cardFrontElement.innerHTML = `<p>Error loading cards: ${result.errors?.general || 'Unknown error'}</p>`;
               document.querySelector('.study-controls').style.display = 'none';
            }
        } catch (error) {
            console.error("Failed to fetch study cards:", error);
            cardFrontElement.innerHTML = `<p>Error loading cards: ${error.message}</p>`;
            document.querySelector('.study-controls').style.display = 'none';
            // Set deck title fallback even on error
             fetchDeckName(deckId); // Still try to get the deck name
        }
    }
  
    async function fetchDeckName(deckId) {
       console.log("fetchDeckName called for deck ID:", deckId); // Log which deck ID is being fetched
       try {
          const response = await fetch(`/api/decks/${deckId}`);
           console.log("API Response Status (Deck Name):", response.status);
           if (!response.ok) {
               console.error("Failed to fetch deck name, status:", response.status);
               deckTitleElement.textContent = `Deck ID: ${deckId}`;
               return;
           }
           const result = await response.json();
           console.log("API Result (Deck Name):", result);
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
        console.log("loadCard called with data:", cardData); // Log data passed to loadCard
        if (!cardData || typeof cardData.front === 'undefined' || typeof cardData.back === 'undefined') {
             console.error("Invalid cardData passed to loadCard:", cardData);
             cardFrontElement.innerHTML = `<p>Error loading card content.</p>`;
             cardBackElement.innerHTML = `<p></p>`;
             cardCounterElement.textContent = "Error";
             progressBar.style.width = "0%";
             document.querySelector('.study-controls').style.display = 'none';
             return;
        }

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

            console.log(`Attempting to submit review. Rating: '${rating}', Flashcard ID: '${flashcardId}'`);

            if (!flashcardId || !rating) {
                console.error("Cannot submit review. Missing flashcard ID or rating.", { flashcardId, rating });
                alert("Error: Cannot submit review. Missing data.");
                return;
            }

            difficultyButtons.forEach(b => b.disabled = true);
            await submitReview(flashcardId, rating);
            // Buttons are re-enabled in finally block of submitReview
        });
    });

    async function submitReview(flashcardId, ratingString) {
        // Add loading indicator to the specific button
        const clickedButton = document.querySelector(`.study-controls .control-btn[data-difficulty="${ratingString}"]`);
        let originalButtonContent = null;
        if (clickedButton) {
             originalButtonContent = clickedButton.innerHTML;
             clickedButton.innerHTML = '<span class="btn-loader"></span>'; // Use innerHTML for loader
        }


        try {
            const response = await fetch(`/api/study/review/${flashcardId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ rating: ratingString }),
            });
            const result = await response.json();
            console.log("Submit Review API Result:", result); // Log review result

            if (response.ok && result.success) {
                currentCardIndex++;
                if (currentCardIndex < studyCards.length) {
                    loadCard(studyCards[currentCardIndex]);
                } else {
                    // --- End of study session ---
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

                    // Focus/open dropdown
                    if (deckSelectElement) {
                         // Reset dropdown to prompt selection if it was pre-selected from URL
                         deckSelectElement.value = ""; // Select the default option

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
        } finally {
            difficultyButtons.forEach(b => b.disabled = false);
            // Restore original content only to the button that was clicked if available
            if (clickedButton && originalButtonContent !== null) {
                 clickedButton.innerHTML = originalButtonContent;
            }
        }
    }

    async function populateDeckSelector() {
        console.log("Attempting to populate deck selector...");
        try {
            const response = await fetch('/api/decks');
            console.log("API Response Status (populateDeckSelector):", response.status);
            if (!response.ok) {
                 console.error("Failed to fetch decks for selector", response.status);
                 return;
            }
            const result = await response.json();
            console.log("API Result (populateDeckSelector):", result);

            if (result.success && result.decks) {
                console.log(`Fetched ${result.decks.length} decks for selector.`);
                deckSelectElement.innerHTML = '<option value="">Select another deck...</option>';
                result.decks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.id;
                    option.textContent = deck.name;
                    // Select the deck from the initial URL parameter if it exists
                    if (initialDeckIdFromUrl && deck.id.toString() === initialDeckIdFromUrl) {
                        option.selected = true;
                    }
                    deckSelectElement.appendChild(option);
                });
            } else {
                 console.warn("API returned success: true but no decks array for selector.");
            }
        } catch (error) {
            console.error("Error populating deck selector:", error);
        }
    }

    // --- Deck select change listener - NOW LOADS IN PLACE ---
    if (deckSelectElement) {
        deckSelectElement.addEventListener("change", (event) => {
          const selectedDeckId = event.target.value;
          console.log("Deck selector changed. Selected ID:", selectedDeckId);
          if (selectedDeckId) {
               // Instead of redirecting, call fetchStudyCards directly
               fetchStudyCards(selectedDeckId);
               // Update browser history URL without full reload (optional but good UX)
               history.pushState(null, '', `/study?deck_id=${selectedDeckId}`);
          } else {
              // Handle selecting the default "Select a deck..." option (clearing current study session)
               console.log("Selected default option. Clearing current study session.");
               currentDeckId = null; // Reset global state
               studyCards = [];
               currentCardIndex = 0;
               // Reset UI to initial state
               deckTitleElement.textContent = "NeuroFlash Study";
               cardCounterElement.textContent = "";
               progressBar.style.width = "0%";
               flashcardElement.classList.remove("flipped");
               cardFrontElement.innerHTML = "<p>Select a deck to begin.</p>";
               cardBackElement.innerHTML = "<p>Choose a deck from the dropdown above.</p>";
               document.querySelector('.study-controls').style.display = 'none';
               // Update browser history URL (optional)
               history.pushState(null, '', '/study');
          }
        });
    } else {
        console.error("Deck select element not found.");
    }


    // --- Keyboard Shortcuts --- (Existing logic)
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        // Only allow actions if there are cards loaded
        if (studyCards.length === 0) return;

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


    // --- Initial Load ---
    populateDeckSelector(); // Always populate the selector on page load

    // If a deck ID was in the original URL, fetch cards for it
    if (initialDeckIdFromUrl) {
        fetchStudyCards(initialDeckIdFromUrl);
         // The deck title and card count will be updated by fetchStudyCards
    } else {
        // Set initial state for when no deck ID is provided
        deckTitleElement.textContent = "NeuroFlash Study";
        cardCounterElement.textContent = "";
        progressBar.style.width = "0%";
        flashcardElement.classList.remove("flipped");
        cardFrontElement.innerHTML = "<p>Select a deck to begin.</p>";
        cardBackElement.innerHTML = "<p>Choose a deck from the dropdown above.</p>";
        document.querySelector('.study-controls').style.display = 'none';
    }

    console.log("API Result (Study Session):", result); // Log the raw result
  if (result.success && result.cards) {
    studyCards = result.cards;
    console.log("Fetched Study Cards (Processed in JS):", studyCards); // **** Check this log ****
}

});