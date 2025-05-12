document.addEventListener("DOMContentLoaded", () => {
  const deckNameInput = document.getElementById("deck-name");
  const deckDescriptionInput = document.getElementById("deck-description");
  const tagInput = document.getElementById("tagInput");
  const tagsListContainer = document.getElementById("tagsList");
  const addCardBtn = document.getElementById("addCard");
  const cardsListContainer = document.getElementById("cardsList");
  // const saveDraftBtn = document.getElementById("saveDraft"); // We'll handle draft status later if needed
  const createDeckBtn = document.getElementById("createDeck");

  let tags = [];
  let cardsData = []; // This will store card front/back for submission, not for rendering complex elements directly

  tagInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && this.value.trim() !== "") {
      e.preventDefault();
      addTagToList(this.value.trim());
      this.value = "";
    }
  });

  function addTagToList(tagName) {
    if (!tags.includes(tagName) && tagName.length > 0) {
      tags.push(tagName);
      renderTagsForDisplay();
    }
  }

  function renderTagsForDisplay() {
    tagsListContainer.innerHTML = tags
      .map(
        (tag) => `
              <span class="tag">
                  ${tag}
                  <button type="button" class="remove-tag" data-tag-name="${tag}">×</button>
              </span>
          `
      )
      .join("");

    // Add event listeners to new remove buttons
    tagsListContainer.querySelectorAll('.remove-tag').forEach(button => {
        button.addEventListener('click', function() {
            removeTagFromList(this.dataset.tagName);
        });
    });
  }

  // Make removeTagFromList globally accessible or handle via event delegation
  window.removeTagFromList = (tagName) => { // Changed from `removeTag` to avoid conflict if any
    tags = tags.filter((t) => t !== tagName);
    renderTagsForDisplay();
  };
  
  // Event delegation for removing tags
  tagsListContainer.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('remove-tag')) {
        removeTagFromList(e.target.dataset.tagName);
    }
  });


  addCardBtn.addEventListener("click", () => {
    addNewCardToData();
  });

  function addNewCardToData(front = "", back = "") {
    const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // More unique ID
    cardsData.push({ id: cardId, front, back });
    renderCardInputs();
  }

  function renderCardInputs() {
    cardsListContainer.innerHTML = cardsData
      .map(
        (card, index) => `
              <div class="card-item" data-id="${card.id}">
                  <div class="card-item-header">
                    <h4>Card ${index + 1}</h4>
                    <button type="button" class="btn icon-btn delete-card-btn" data-card-id="${card.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="card-preview">
                      <div class="card-side">
                          <label for="${card.id}-front">Front</label>
                          <textarea id="${card.id}-front" placeholder="Question or term" data-side="front">${card.front}</textarea>
                      </div>
                      <div class="card-side">
                          <label for="${card.id}-back">Back</label>
                          <textarea id="${card.id}-back" placeholder="Answer or definition" data-side="back">${card.back}</textarea>
                      </div>
                  </div>
                  <!-- Removed move buttons for simplicity, can be added back if essential for MVP -->
              </div>
          `
      )
      .join("");

    // Add event listeners for dynamic content
    cardsListContainer.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', function() {
            updateCardData(this.closest('.card-item').dataset.id, this.dataset.side, this.value);
        });
    });
    cardsListContainer.querySelectorAll('.delete-card-btn').forEach(button => {
        button.addEventListener('click', function() {
            deleteCardData(this.dataset.cardId);
        });
    });
  }

  function updateCardData(id, side, value) {
    const card = cardsData.find((c) => c.id === id);
    if (card) {
      card[side] = value;
    }
  }

  function deleteCardData(id) {
    cardsData = cardsData.filter((c) => c.id !== id);
    renderCardInputs();
  }

  // saveDraftBtn.addEventListener("click", () => {
  //   submitDeckData("draft");
  // });

  createDeckBtn.addEventListener("click", async () => {
    await submitDeckData("published"); // Assuming "published" is the default status
  });

   async function submitDeckData(status) {
    const deckName = deckNameInput.value.trim();
    if (!deckName) {
      alert("Deck name is required.");
      deckNameInput.focus();
      return;
    }

     const validCards = cardsData.filter(card => card.front.trim() && card.back.trim());
    if (validCards.length === 0 && cardsData.length > 0) {
        alert("At least one card must have both a front and a back, or no cards should be added if the deck is intended to be empty initially.");
        // Decide if you want to allow creating a deck with empty/incomplete cards
        // For now, let's require at least one complete card if cards are present
        // return; // Uncomment if you want to enforce this strictly for now
    }
    if (cardsData.length > 0 && validCards.length !== cardsData.length) {
        alert("Some cards are incomplete (missing front or back). Only complete cards will be saved.");
        // Or you can choose to prevent submission:
        // return;
    }


    const deckPayload = {
      name: deckName,
      description: deckDescriptionInput.value.trim(),
      tags: tags, // tags is already an array of strings
      cards: validCards.map(card => ({ front: card.front, back: card.back })), // Send only front and back
      // status: status, // Removed as backend doesn't explicitly use it now
    };

    console.log("Submitting deck with cards:", deckPayload);
    createDeckBtn.disabled = true;
    createDeckBtn.innerHTML = '<span class="btn-loader"></span> Creating...';

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(deckPayload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`Deck "${result.deck.name}" and ${result.deck.card_count} card(s) created successfully!`);
        window.location.href = "/dashboard"; 
      } else {
        const errorMsg = result.errors ? Object.values(result.errors).join(", ") : (result.message || "Failed to create deck.");
        alert(`Error: ${errorMsg}`);
      }
    } catch (error) {
      console.error("Error submitting deck:", error);
      alert("An unexpected error occurred. Please try again.");
    } finally {
        createDeckBtn.disabled = false;
        createDeckBtn.innerHTML = 'Create Deck';
    }
  }

  // Initialize with an empty card input
  addNewCardToData();
});