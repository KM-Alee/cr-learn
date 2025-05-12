// static/js/edit-deck.js
document.addEventListener("DOMContentLoaded", () => {
    const deckNameDisplay = document.getElementById('deck-name-display');
    const deckDescriptionDisplay = document.getElementById('deck-description-display');
    const tagsListDisplay = document.getElementById('tagsListDisplay');
    const cardsListContainer = document.getElementById('cardsListContainer');
    const cardCountSpan = document.getElementById('card-count');
    const addCardBtn = document.getElementById('addCardBtn');
    
    const pathParts = window.location.pathname.split('/');
    const deckId = pathParts[pathParts.length - 2]; 

    let currentCards = []; 

        function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }

    if (!deckId || isNaN(deckId)) {
        console.error("Could not find Deck ID");
        cardsListContainer.innerHTML = "<p>Error: Deck ID not found.</p>";
        return;
    }

    async function fetchDeckData() {
        // ... (fetchDeckData function remains the same as before) ...
        try {
            const response = await fetch(`/api/decks/${deckId}/cards`);
            if (!response.ok) {
                if (response.status === 401) { window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname); return; }
                if (response.status === 404) { throw new Error('Deck not found or access denied.'); }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success) {
                deckNameDisplay.textContent = result.deck.name;
                deckDescriptionDisplay.textContent = result.deck.description || 'No description.';
                tagsListDisplay.innerHTML = result.deck.tags 
                    ? result.deck.tags.split(',').map(tag => `<span class="tag">${tag.trim()}</span>`).join(' ')
                    : '<span>No tags</span>';

                currentCards = result.cards;
                cardCountSpan.textContent = currentCards.length;
                renderCardsList();
            } else {
                throw new Error(result.errors?.general || 'Failed to load deck data.');
            }
        } catch (error) {
            console.error("Error fetching deck data:", error);
            cardsListContainer.innerHTML = `<p style="color: red;">Error loading deck data: ${error.message}</p>`;
            deckNameDisplay.textContent = 'Error';
        }
    }

    function renderCardsList() {
        // ... (renderCardsList function remains the same as before, ensure it uses escapeHtml) ...
        if (currentCards.length === 0) {
            cardsListContainer.innerHTML = "<p>This deck has no cards yet. Click 'Add New Card' to get started!</p>";
            return;
        }

        cardsListContainer.innerHTML = currentCards.map((card, index) => `
            <div class="card-item" data-note-id="${card.note_id}" data-flashcard-id="${card.flashcard_id}">
                <div class="card-item-header">
                    <h4>Card ${index + 1} (Note ID: ${card.note_id})</h4>
                    <div>
                         <button type="button" class="btn icon-btn edit-card-btn" title="Edit Card">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                         <button type="button" class="btn icon-btn delete-card-btn" title="Delete Card">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content-display">
                     <div style="margin-bottom: 5px;"><strong>Front:</strong> <p style="margin:0; padding-left: 5px;">${escapeHtml(card.front)}</p></div>
                     <div><strong>Back:</strong> <p style="margin:0; padding-left: 5px;">${escapeHtml(card.back)}</p></div>
                </div>
                <div class="card-content-edit" style="display: none;">
                    <div class="card-side">
                        <label>Front</label>
                        <textarea class="edit-card-front" placeholder="Question or term">${escapeHtml(card.front)}</textarea>
                    </div>
                    <div class="card-side">
                        <label>Back</label>
                        <textarea class="edit-card-back" placeholder="Answer or definition">${escapeHtml(card.back)}</textarea>
                    </div>
                    <button type="button" class="btn primary-btn save-card-btn">Save</button>
                    <button type="button" class="btn secondary-btn cancel-edit-btn">Cancel</button>
                </div>
            </div>
        `).join('');
        addEventListenersToCards();
    }
    

    function addEventListenersToCards() {
        // ... (addEventListenersToCards function remains the same) ...
        cardsListContainer.querySelectorAll('.edit-card-btn').forEach(btn => {
            btn.addEventListener('click', handleEditCardClick);
        });
        cardsListContainer.querySelectorAll('.delete-card-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteCardClick);
        });
        cardsListContainer.querySelectorAll('.save-card-btn').forEach(btn => {
            btn.addEventListener('click', handleSaveCardClick);
        });
        cardsListContainer.querySelectorAll('.cancel-edit-btn').forEach(btn => {
            btn.addEventListener('click', handleCancelEditClick);
        });
    }
    
    function handleEditCardClick(event) {
        // ... (handleEditCardClick function remains the same) ...
        const cardItem = event.target.closest('.card-item');
        cardItem.querySelector('.card-content-display').style.display = 'none';
        cardItem.querySelector('.card-content-edit').style.display = 'block';
    }

    function handleCancelEditClick(event) {
        // ... (handleCancelEditClick function remains the same) ...
        const cardItem = event.target.closest('.card-item');
        // Reset textareas to original values before hiding edit form
        const noteId = cardItem.dataset.noteId;
        const originalCard = currentCards.find(c => c.note_id.toString() === noteId);
        if (originalCard) {
            cardItem.querySelector('.edit-card-front').value = originalCard.front;
            cardItem.querySelector('.edit-card-back').value = originalCard.back;
        }
        cardItem.querySelector('.card-content-display').style.display = 'block';
        cardItem.querySelector('.card-content-edit').style.display = 'none';
    }
    
    async function handleSaveCardClick(event) {
        const cardItem = event.target.closest('.card-item');
        const noteId = cardItem.dataset.noteId;
        const frontText = cardItem.querySelector('.edit-card-front').value.trim();
        const backText = cardItem.querySelector('.edit-card-back').value.trim();
        
        if (!frontText || !backText) {
            alert("Front and Back cannot be empty.");
            return;
        }
        
        const saveButton = cardItem.querySelector('.save-card-btn');
        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="btn-loader"></span> Saving...';

        await updateCardAPI(noteId, frontText, backText, cardItem);
        
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
    }

    async function handleDeleteCardClick(event) {
        const cardItem = event.target.closest('.card-item');
        const noteId = cardItem.dataset.noteId; // This is correct
        
        if (confirm(`Are you sure you want to delete this card (Note ID: ${noteId})? This cannot be undone.`)) {
            const deleteButton = event.target.closest('.delete-card-btn'); // Get the button itself
            const originalButtonContent = deleteButton.innerHTML;
            deleteButton.disabled = true;
            deleteButton.innerHTML = '<span class="btn-loader"></span>'; // Loader

            await deleteCardAPI(noteId, cardItem);
            
            // No need to re-enable if element is removed on success.
            // If deletion failed, you might re-enable and restore icon.
            // deleteButton.disabled = false;
            // deleteButton.innerHTML = originalButtonContent;
        }
    }
    
    addCardBtn.addEventListener('click', () => {
        // Check if a new card form already exists to prevent multiple
        if (cardsListContainer.querySelector('.new-card-form')) {
            cardsListContainer.querySelector('.new-card-form .new-card-front').focus();
            return;
        }
        addNewCardForm(); 
    });
    
    function addNewCardForm() {
        // ... (addNewCardForm function remains the same) ...
         const newCardFormHtml = `
            <div class="card-item new-card-form">
                <div class="card-item-header">
                    <h4>New Card</h4>
                     <button type="button" class="btn icon-btn cancel-new-card-btn" title="Cancel Add">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="card-content-edit" style="display: block;">
                    <div class="card-side">
                        <label>Front</label>
                        <textarea class="new-card-front" placeholder="Question or term"></textarea>
                    </div>
                    <div class="card-side">
                        <label>Back</label>
                        <textarea class="new-card-back" placeholder="Answer or definition"></textarea>
                    </div>
                    <button type="button" class="btn primary-btn save-new-card-btn">Add Card</button>
                </div>
            </div>
        `;
        // Add to the top for better visibility
        cardsListContainer.insertAdjacentHTML('afterbegin', newCardFormHtml); 
        
        const newForm = cardsListContainer.querySelector('.new-card-form');
        newForm.querySelector('.save-new-card-btn').addEventListener('click', handleSaveNewCardClick);
        newForm.querySelector('.cancel-new-card-btn').addEventListener('click', () => newForm.remove());
        newForm.querySelector('.new-card-front').focus();
    }

    async function handleSaveNewCardClick(event) {
        const form = event.target.closest('.new-card-form');
        const frontText = form.querySelector('.new-card-front').value.trim();
        const backText = form.querySelector('.new-card-back').value.trim();

        if (!frontText || !backText) {
            alert("Front and Back cannot be empty for a new card.");
            return;
        }

        const saveButton = form.querySelector('.save-new-card-btn');
        const originalButtonText = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="btn-loader"></span> Adding...';

        await addNewCardAPI(frontText, backText, form);
        
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
    }

    // --- API Call Functions ---
    async function addNewCardAPI(front, back, formElement) {
        console.log("addNewCardAPI called with:", { front, back }); // Log input
        try {
            const response = await fetch(`/api/decks/${deckId}/cards`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ front, back }),
            });
            const result = await response.json();
            console.log("API Response for Add Card:", result); // **** Log the entire API response ****

            if (response.ok && result.success) {
                if (result.card && result.card.note_id != null) { // **** Check if result.card is valid ****
                    console.log("New card data from API:", result.card);
                    currentCards.unshift(result.card); 
                    console.log("currentCards after unshift:", currentCards);
                    
                    cardCountSpan.textContent = currentCards.length;
                    
                    if (formElement && typeof formElement.remove === 'function') {
                        formElement.remove(); 
                    } else {
                        console.warn("formElement was not valid or not provided for removal.");
                    }
                    
                    console.log("Calling renderCardsList after adding new card.");
                    renderCardsList(); 
                    
                    alert(result.message || "Card added successfully!");
                } else {
                    console.error("API success but result.card is invalid or missing:", result.card);
                    alert("Error: Received invalid card data from server.");
                }
            } else {
                console.error("API error response:", result);
                alert(`Error adding card: ${result.errors?.general || result.errors?.content || result.message || 'Unknown server error'}`);
            }
        } catch (error) {
            console.error("Failed to add new card (JS catch block):", error);
            alert("An unexpected error occurred while adding the card. Check console.");
        }
    }

    async function updateCardAPI(noteId, front, back, cardItemElement) {
        try {
            const response = await fetch(`/api/notes/${noteId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ front, back }),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                // Update local data
                const cardIndex = currentCards.findIndex(c => c.note_id.toString() === noteId);
                if (cardIndex > -1) {
                    currentCards[cardIndex].front = result.card.front;
                    currentCards[cardIndex].back = result.card.back;
                }
                // Update UI display part
                const displayDiv = cardItemElement.querySelector('.card-content-display');
                displayDiv.innerHTML = `
                     <div style="margin-bottom: 5px;"><strong>Front:</strong> <p style="margin:0; padding-left: 5px;">${escapeHtml(result.card.front)}</p></div>
                     <div><strong>Back:</strong> <p style="margin:0; padding-left: 5px;">${escapeHtml(result.card.back)}</p></div>
                `;
                // Switch back to display mode
                cardItemElement.querySelector('.card-content-display').style.display = 'block';
                cardItemElement.querySelector('.card-content-edit').style.display = 'none';
                alert(result.message || "Card updated successfully!");
            } else {
                alert(`Error updating card: ${result.errors?.general || result.errors?.content || result.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Failed to update card:", error);
            alert("An unexpected error occurred while updating the card.");
        }
    }

    async function deleteCardAPI(noteId, cardItemElement) {
        try {
            const response = await fetch(`/api/notes/${noteId}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' }
            });
            const result = await response.json();

            if (response.ok && result.success) {
                currentCards = currentCards.filter(c => c.note_id.toString() !== noteId);
                cardItemElement.remove();
                cardCountSpan.textContent = currentCards.length;
                if (currentCards.length === 0) { // If last card deleted
                    renderCardsList(); // Show "no cards" message
                }
                alert(result.message || "Card deleted successfully!");
            } else {
                alert(`Error deleting card: ${result.errors?.general || result.message || 'Unknown error'}`);
                // Re-enable delete button if deletion failed and element wasn't removed
                const deleteButton = cardItemElement.querySelector('.delete-card-btn');
                if (deleteButton) {
                    deleteButton.disabled = false;
                    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                }
            }
        } catch (error) {
            console.error("Failed to delete card:", error);
            alert("An unexpected error occurred while deleting the card.");
        }
    }
    
    fetchDeckData(); // Initial fetch
});