document.addEventListener("DOMContentLoaded", () => {
  // --- Get DOM Elements ---
  const deckNameInput = document.getElementById("deck-name");
  const deckDescriptionInput = document.getElementById("deck-description");
  const tagInput = document.getElementById("tagInput");
  const tagsListContainer = document.getElementById("tagsList");
  const addCardBtn = document.getElementById("addCard");
  const cardsListContainer = document.getElementById("cardsList");
  const createDeckBtn = document.getElementById("createDeck");

  // --- Data Storage ---
  let tags = []; // Array to hold tag strings
  let cardsData = []; // Array to hold card { id, front, back } objects

  console.log("JS Loaded. Initial tags array:", JSON.stringify(tags)); // Log at script load

  // --- Helper to prevent XSS ---
  function escapeHtml(unsafe) {
      if (typeof unsafe !== 'string') return unsafe === null || unsafe === undefined ? '' : String(unsafe);
      return unsafe
          .replace(/&/g, "&")
          .replace(/</g, "<")
          .replace(/>/g, ">")
          .replace(/"/g, "\"")
          .replace(/'/g, "'");
  }

  // --- Tag Management ---

  // Add tag when Enter is pressed in the tag input field
  if (tagInput) { // Safety check
    tagInput.addEventListener("keydown", function (e) {
      console.log("TagInput keydown event:", e.key); // Debug key press
      if (e.key === "Enter") {
        e.preventDefault(); // Prevent default form submission (even without a <form>)
        const tagName = this.value.trim();
        console.log("Tag name entered:", tagName); // Debug entered value
        if (tagName) {
          addTag(tagName); // Call function to add tag to array and update display
          this.value = ""; // Clear the input field
        }
      }
    });
  } else { console.error("Element #tagInput not found!"); }


  // Add a tag to the 'tags' array and update the display
  function addTag(tagName) {
    console.log("Attempting to add tag:", tagName); // Debug call
    // Add only if the tag name is not already in the array and not empty
    if (tagName && !tags.includes(tagName)) { // Check tagName is truthy and not already included
      tags.push(tagName);
      console.log("Tag added. Current tags array:", JSON.stringify(tags)); // Debug: confirm tag was added
      renderTagsDisplay(); // Update the visual list of tags
    } else {
       console.log("Tag not added:", tagName, "(Either empty or already exists)"); // Debug why not added
    }
  }

  // Remove a tag from the 'tags' array and update the display
  function removeTag(tagName) {
      console.log("Attempting to remove tag:", tagName); // Debug call
      const initialLength = tags.length;
      tags = tags.filter(tag => tag !== tagName); // Filter out the tag
      console.log("Tags array after filter:", JSON.stringify(tags)); // Debug filter result

      if (tags.length < initialLength) {
           renderTagsDisplay(); // Update the visual list only if a tag was actually removed
           console.log("Tag removed. Current tags array:", JSON.stringify(tags)); // Debug: confirm tag was removed
      } else {
          console.log("Tag not found in array for removal:", tagName); // Debug why not removed
      }
  }

  // Render the current tags array into the tagsListContainer HTML
  function renderTagsDisplay() {
    console.log("Rendering tags display. Tags to render:", JSON.stringify(tags)); // Debug call
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
     console.log("Tags display HTML updated."); // Debug: confirm render was called
  }

  // Use event delegation on the tags list container to handle clicks on remove buttons
  if (tagsListContainer) { // Safety check
    tagsListContainer.addEventListener('click', function(e) {
      console.log("Click event on tagsListContainer"); // Debug event
      if (e.target && e.target.classList.contains('remove-tag')) {
        const tagNameToRemove = e.target.dataset.tagName;
        console.log("Remove tag button clicked for tag:", tagNameToRemove); // Debug clicked button
        removeTag(tagNameToRemove); // Call the remove function
      }
    });
  } else { console.error("Element #tagsList not found!"); }


  // --- Card Management ---
  if (addCardBtn) { // Safety check
    addCardBtn.addEventListener("click", () => {
      addNewCard();
    });
  } else { console.error("Element #addCardBtn not found!"); }


  function addNewCard(front = "", back = "") {
    console.log("Adding new card"); // Debug call
    // Generate a more robust unique ID using timestamp and random string
    const cardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; 
    cardsData.push({ id: cardId, front, back });
    console.log("Cards data after adding:", JSON.stringify(cardsData)); // Debug cards data
    renderCardInputs(); // Update the visual list of card inputs
  }

  // Render the current cardsData array into the cardsListContainer HTML
  function renderCardInputs() {
    console.log("Rendering card inputs. Cards to render:", JSON.stringify(cardsData)); // Debug call
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

    // Add event listeners for textarea input (using delegation is also an option here)
    cardsListContainer.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', function() {
            updateCardData(this.closest('.card-item').dataset.id, this.dataset.side, this.value);
        });
    });

    // Use event delegation for delete card buttons
     cardsListContainer.querySelectorAll('.delete-card-btn').forEach(button => {
        button.addEventListener('click', function() {
            const cardIdToDelete = this.dataset.cardId;
            console.log("Delete card button clicked for card ID:", cardIdToDelete); // Debug
            deleteCard(cardIdToDelete);
        });
    });
  }

  // Update card data in the cardsData array based on textarea input
  function updateCardData(id, side, value) {
    // console.log(`Updating card ${id}, side ${side} with value: ${value.substring(0, 50)}...`); // Debug frequent logging
    const card = cardsData.find((c) => c.id === id);
    if (card) {
      card[side] = value;
      // console.log("Card data after update:", JSON.stringify(card)); // Debug
    } else {
        console.warn("Card not found for update with ID:", id);
    }
  }

  // Delete card data from the cardsData array and update the display
  function deleteCard(id) {
    console.log("Attempting to delete card with ID:", id); // Debug
    const initialLength = cardsData.length;
    cardsData = cardsData.filter((card) => card.id !== id);
    if(cardsData.length < initialLength) {
        console.log("Card deleted. Current cardsData array:", JSON.stringify(cardsData)); // Debug
        renderCardInputs(); // Re-render the list of card inputs
    } else {
        console.warn("Card not found for deletion with ID:", id);
    }
  }


  // --- Deck Submission ---

  if (createDeckBtn) { // Safety check
    createDeckBtn.addEventListener("click", async () => {
        // !! CRITICAL LOG - CHECK THIS !!
        console.log("CREATE DECK BUTTON CLICKED. Tags array state:", JSON.stringify(tags)); 
        
        // Call the submission function
        submitDeckData(); 
    });
  } else { console.error("Element #createDeck not found!"); }


   async function submitDeckData() {
    console.log("submitDeckData function called."); // Debug call

    const deckName = deckNameInput ? deckNameInput.value.trim() : '';
    if (!deckName) {
      alert("Deck name is required.");
      if (deckNameInput) deckNameInput.focus();
      return;
    }

    // Filter out cards missing front or back
    const validCards = cardsData.filter(card => card.front.trim() && card.back.trim());
    
    // Add validation/warning if all cards are incomplete or no cards added
    if (cardsData.length === 0) {
         // Decide if an empty deck is allowed. If not:
         // alert("Please add at least one card.");
         // return;
         console.log("Creating an empty deck (no cards added)."); // Log if empty decks allowed
    } else if (validCards.length === 0) {
         alert("Please add at least one complete card (with both front and back text).");
         return; // Prevent submission if cards exist but none are complete
    } else if (validCards.length !== cardsData.length) {
         // Warn if some cards are incomplete but others are valid
         const incompleteCount = cardsData.length - validCards.length;
         const proceed = confirm(`${incompleteCount} card${incompleteCount > 1 ? 's were' : ' was'} incomplete and will not be saved. Do you want to proceed?`);
         if (!proceed) {
             return; // Stop submission
         }
     }


    console.log("Tags array JUST BEFORE PAYLOAD:", JSON.stringify(tags)); // DEBUG: CRITICAL LOG just before payload construction

    const deckPayload = {
      name: deckName,
      description: deckDescriptionInput ? deckDescriptionInput.value.trim() : '',
      tags: tags, // This *must* reference the `tags` array from the outer scope
      cards: validCards.map(card => ({ front: card.front, back: card.back })), // Send only front and back
    };

    console.log("Submitting deck with payload:", JSON.stringify(deckPayload)); // DEBUG: Final payload check

    // Disable button and show loading state
    if (createDeckBtn) {
        createDeckBtn.disabled = true;
        createDeckBtn.innerHTML = '<span class="btn-loader"></span> Creating...'; // Use a simple loader class if you have one
    }


    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          // Add X-CSRFToken header here if you are using Flask-WTF or similar for CSRF protection
          // 'X-CSRFToken': getCookie('csrftoken') // Example if using Django/Flask-WTF pattern
        },
        body: JSON.stringify(deckPayload),
      });

      // Always attempt to parse JSON response, even if response.ok is false
      let result;
      try {
          result = await response.json();
      } catch (jsonError) {
          console.error("Failed to parse JSON response:", jsonError);
          // If JSON parsing fails, try to get text or just report the status
          const textResponse = await response.text();
          console.error("Response text:", textResponse);
          throw new Error(`Received non-JSON response (Status: ${response.status})`); // Throw a different error
      }


      // Check for HTTP status code first (response.ok is true for 2xx)
      if (response.ok && result.success) {
        console.log("Deck creation successful!", result); // Debug success
        alert(`Deck "${escapeHtml(result.deck.name)}" and ${result.deck.card_count || 0} card(s) created successfully!`);
        // Redirect to dashboard on success
        window.location.href = "/dashboard";
      } else {
        // Handle API-specific errors (e.g., validation errors returned by backend)
        let errorMessage = "An error occurred.";
        if (result && result.errors) { // Check if result and result.errors exist
            // Format errors object into a readable string
            errorMessage = Object.entries(result.errors)
                                .map(([key, value]) => {
                                    // Capitalize key for display
                                    const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
                                    return `${displayKey}: ${value}`;
                                })
                                .join("\n"); // Join multiple errors with newline
        } else if (result && result.message) { // Check if result and result.message exist
            errorMessage = result.message; // Use general message if no structured errors
        } else {
             errorMessage = `Server responded with status: ${response.status} ${response.statusText || ''}`; // Fallback for non-JSON errors or unexpected format
        }
        console.error("Deck creation failed. Result:", result);
        alert(`Error creating deck:\n${escapeHtml(errorMessage)}`); // Use alert with formatted errors
      }
    } catch (error) {
      // Handle network errors or errors during fetch/json parsing or non-JSON response
      console.error("Network or unexpected error submitting deck:", error);
      alert("An unexpected error occurred. Please check your connection and try again.");
    } finally {
        // Re-enable button and reset text regardless of success or failure
        if (createDeckBtn) {
            createDeckBtn.disabled = false;
            createDeckBtn.innerHTML = 'Create Deck'; // Reset to original text/HTML
        }
    }
  }

  // --- Initialization ---
  // Initialize with one empty card input when the page loads
  addNewCard(); 

  // You might also want to add logic here to load a draft if saved previously
});