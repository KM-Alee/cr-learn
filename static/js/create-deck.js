document.addEventListener("DOMContentLoaded", () => {
  const deckNameInput = document.getElementById("deck-name");
  const deckDescriptionInput = document.getElementById("deck-description");
  const tagInput = document.getElementById("tagInput");
  const tagsListContainer = document.getElementById("tagsList");
  const addCardBtn = document.getElementById("addCard");
  const cardsListContainer = document.getElementById("cardsList");
  const createDeckBtn = document.getElementById("createDeck");

  let tags = [];
  let cardsData = [];

  function escapeHtml(unsafe) {
      if (typeof unsafe !== 'string') return unsafe === null || unsafe === undefined ? '' : String(unsafe);
      return unsafe
          .replace(/&/g, "&")
          .replace(/</g, "<")
          .replace(/>/g, ">")
          .replace(/"/g, "\"")
          .replace(/'/g, "'");
  }

  if (tagInput) {
    tagInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const tagName = this.value.trim();
        if (tagName) {
          addTag(tagName);
          this.value = "";
        }
      }
    });
  } else { console.error("Element #tagInput not found!"); }


  function addTag(tagName) {
    if (tagName && !tags.includes(tagName)) {
      tags.push(tagName);
      renderTagsDisplay();
    }
  }

  function removeTag(tagName) {
      const initialLength = tags.length;
      tags = tags.filter(tag => tag !== tagName);
      if (tags.length < initialLength) {
           renderTagsDisplay();
      }
  }

  function renderTagsDisplay() {
     if (!tagsListContainer) {
         console.error("Element #tagsList not found!");
         return;
     }
    tagsListContainer.innerHTML = tags.map(tag => `
        <span class="tag">
            ${escapeHtml(tag)}
            <button type="button" class="remove-tag" data-tag-name="${escapeHtml(tag)}" aria-label="Remove tag ${escapeHtml(tag)}">×</button>
        </span>
    `).join('');
  }

  if (tagsListContainer) {
    tagsListContainer.addEventListener('click', function(e) {
      if (e.target && e.target.classList.contains('remove-tag')) {
        const tagNameToRemove = e.target.dataset.tagName;
        removeTag(tagNameToRemove);
      }
    });
  } else { console.error("Element #tagsList not found!"); }


  if (addCardBtn) {
    addCardBtn.addEventListener("click", () => {
      addNewCard();
    });
  } else { console.error("Element #addCard not found!"); }


  function addNewCard(front = "", back = "") {
    const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    cardsData.push({ id: cardId, front, back });
    renderCardInputs();
  }

  function renderCardInputs() {
     if (!cardsListContainer) {
         console.error("Element #cardsList not found!");
         return;
     }
    cardsListContainer.innerHTML = cardsData
      .map(
        (card, index) => `
              <div class="card-item" data-id="${card.id}">
                  <div class="card-item-header">
                    <h4>Card ${index + 1}</h4>
                    <button type="button" class="btn icon-btn delete-card-btn" data-card-id="${card.id}" aria-label="Delete card ${index + 1}">
                        <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <div class="card-preview">
                      <div class="card-side">
                          <label for="${card.id}-front">Front</label>
                          <textarea id="${card.id}-front" placeholder="Question or term" data-side="front">${escapeHtml(card.front)}</textarea>
                      </div>
                      <div class="card-side">
                          <label for="${card.id}-back">Back</label>
                          <textarea id="${card.id}-back" placeholder="Answer or definition" data-side="back">${escapeHtml(card.back)}</textarea>
                      </div>
                  </div>
              </div>
          `
      )
      .join("");

    cardsListContainer.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', function() {
            updateCardData(this.closest('.card-item').dataset.id, this.dataset.side, this.value);
        });
    });

     cardsListContainer.querySelectorAll('.delete-card-btn').forEach(button => {
        button.addEventListener('click', function() {
            const cardIdToDelete = this.dataset.cardId;
            deleteCard(cardIdToDelete);
        });
    });
  }

  function updateCardData(id, side, value) {
    const card = cardsData.find((c) => c.id === id);
    if (card) {
      card[side] = value;
    } else {
        console.warn("Card not found for update with ID:", id);
    }
  }

  function deleteCard(id) {
    const initialLength = cardsData.length;
    cardsData = cardsData.filter((card) => card.id !== id);
    if(cardsData.length < initialLength) {
        renderCardInputs();
    } else {
        console.warn("Card not found for deletion with ID:", id);
    }
  }

  if (createDeckBtn) {
    createDeckBtn.addEventListener("click", async () => {
        submitDeckData();
    });
  } else { console.error("Element #createDeck not found!"); }


   async function submitDeckData() {
    const deckName = deckNameInput ? deckNameInput.value.trim() : '';
    if (!deckName) {
      alert("Deck name is required.");
      if (deckNameInput) deckNameInput.focus();
      return;
    }

    const validCards = cardsData.filter(card => card.front.trim() && card.back.trim());

    if (cardsData.length === 0) {
         console.log("Creating an empty deck (no cards added).");
    } else if (validCards.length === 0) {
         alert("Please add at least one complete card (with both front and back text).");
         return;
    } else if (validCards.length !== cardsData.length) {
         const incompleteCount = cardsData.length - validCards.length;
         const proceed = confirm(`${incompleteCount} card${incompleteCount > 1 ? 's were' : ' was'} incomplete and will not be saved. Do you want to proceed?`);
         if (!proceed) {
             return;
         }
     }

    const deckPayload = {
      name: deckName,
      description: deckDescriptionInput ? deckDescriptionInput.value.trim() : '',
      tags: tags,
      cards: validCards.map(card => ({ front: card.front, back: card.back })),
    };

    if (createDeckBtn) {
        createDeckBtn.disabled = true;
        createDeckBtn.innerHTML = '<span class="btn-loader"></span> Creating...';
    }

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(deckPayload),
      });

      let result;
      try {
          result = await response.json();
      } catch (jsonError) {
          const textResponse = await response.text();
          throw new Error(`Received non-JSON response (Status: ${response.status})`);
      }

      if (response.ok && result.success) {
        alert(`Deck "${escapeHtml(result.deck.name)}" and ${result.deck.card_count || 0} card(s) created successfully!`);
        window.location.href = "/dashboard";
      } else {
        let errorMessage = "An error occurred.";
        if (result && result.errors) {
            errorMessage = Object.entries(result.errors)
                                .map(([key, value]) => {
                                    const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                                    return `${displayKey}: ${value}`;
                                })
                                .join("\n");
        } else if (result && result.message) {
            errorMessage = result.message;
        } else {
             errorMessage = `Server responded with status: ${response.status} ${response.statusText || ''}`;
        }
        alert(`Error creating deck:\n${escapeHtml(errorMessage)}`);
      }
    } catch (error) {
      alert("An unexpected error occurred. Please check your connection and try again.");
    } finally {
        if (createDeckBtn) {
            createDeckBtn.disabled = false;
            createDeckBtn.innerHTML = 'Create Deck';
        }
    }
  }

  addNewCard();
});