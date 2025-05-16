document.addEventListener("DOMContentLoaded", () => {
  // --- COMMON DOM Elements ---
  const decksGrid = document.querySelector(".decks-grid");
  const statsTotalDecksElement = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p");
  const statsCardsMasteredElement = document.querySelector(".stats-grid .stat-card:nth-child(2) .stat-info p");
  const statsUserPointsElement = document.querySelector("#points-stat-card .stat-info p"); // Ensure this ID exists in HTML

  let activeMenuButton = null; 

  // --- Elements for Card Browser Tab ---
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  const cardSearchInput = document.getElementById("card-search-input");
  const deckFilterSelect = document.getElementById("deck-filter-select");
  const tagFilterSelect = document.getElementById("tag-filter-select");
  const applyCardFilterBtn = document.getElementById("apply-card-filter-btn");
  const clearCardFilterBtn = document.getElementById("clear-card-filter-btn");
  
  const cardResultsContainer = document.getElementById("card-results-container");
  // Safer initialization for cardResultsTable and cardResultsTbody
  const cardResultsTable = cardResultsContainer ? cardResultsContainer.querySelector(".card-results-table") : null;
  const cardResultsTbody = document.getElementById("card-results-tbody"); // This should be fine if the ID is always present
  
  const loadingCardsMessage = document.getElementById("loading-cards-message");
  const noCardsFoundMessage = document.getElementById("no-cards-found-message");
  const cardBrowserInitialMessage = document.getElementById("card-browser-initial-message");
  
  const createCustomDeckBtn = document.getElementById("create-custom-deck-btn");
  const selectAllCardsCheckbox = document.getElementById("select-all-cards-checkbox");

  let tagsLoadedSuccessfully = false;
  let decksLoadedSuccessfully = false;

  // --- Debounce Helper ---
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }
  // Moved debouncedSearchUserCards definition after searchUserCards is defined
  // const debouncedSearchUserCards = debounce(searchUserCards, 400); 

  // --- Helper to prevent XSS ---
  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe === null || unsafe === undefined ? '' : String(unsafe);
    return unsafe
      .replace(/&/g, "&") // Corrected escape for &
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "\"")
      .replace(/'/g, "'");
  }

  // --- Tab Switching Logic ---
  if (tabButtons.length > 0 && tabContents.length > 0) {
    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const targetTab = button.dataset.tab;
        const targetContent = document.getElementById(`${targetTab}-content`);

        tabButtons.forEach(btn => btn.classList.remove("active"));
        tabContents.forEach(content => content.classList.remove("active"));

        button.classList.add("active");
        if (targetContent) {
            targetContent.classList.add("active");
        } else {
            console.error(`Tab content for '${targetTab}' not found.`);
        }


        if (targetTab === 'browse') {
          if (!tagsLoadedSuccessfully && tagFilterSelect) {
              loadTagsForFilter();
          }
          if (!decksLoadedSuccessfully && deckFilterSelect) {
              loadDecksForFilter();
          }
          // Ensure elements exist before accessing properties
          if (cardResultsTbody && cardResultsTbody.children.length === 0 && 
              loadingCardsMessage && (loadingCardsMessage.style.display === 'none' || !loadingCardsMessage.style.display) &&
              cardBrowserInitialMessage) {
              cardBrowserInitialMessage.style.display = 'block';
              if (cardResultsTable) cardResultsTable.style.display = 'none';
              if (noCardsFoundMessage) noCardsFoundMessage.style.display = 'none';
          }
        } else if (targetTab === 'decks') {
          // loadDecks(); // Consider if these should be re-loaded every time or only if stale
          // loadDashboardStats(); 
        }
      });
    });
  }


  // --- "My Decks" Tab Functions ---
  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up";
    deckCard.dataset.deckId = deck.id;

    const masteredPercentage = deck.mastered_percentage !== undefined ? parseFloat(deck.mastered_percentage).toFixed(0) : 0;
    const cardCount = deck.card_count || 0;
    const tagsHtml = deck.tags 
        ? deck.tags.split(',').map(tag => `<span class="tag-item">${escapeHtml(tag.trim())}</span>`).join(' ') 
        : '<span class="no-tags">No tags</span>';

    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${escapeHtml(deck.name)}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
        <button class="btn icon-btn deck-options-btn" data-deck-id="${deck.id}" title="More options">
            <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
      ${deck.description ? `<p class="deck-description">${escapeHtml(deck.description)}</p>` : ''}
      <div class="deck-tags-list">
        ${tagsHtml}
      </div>
      <div class="deck-progress">
        <div class="progress-bar">
          <div class="progress" style="width: ${masteredPercentage}%"></div>
        </div>
        <span class="progress-text">${masteredPercentage}% Mastered</span>
      </div>
      <div class="deck-actions">
        <button class="btn secondary-btn study-now-btn" data-deck-id="${deck.id}">
          <i class="fas fa-graduation-cap"></i> Study Now
        </button>
      </div>
    `;

    const studyButton = deckCard.querySelector(".study-now-btn");
    if (studyButton) {
      studyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // Make sure deckId is correctly retrieved
        const deckId = e.currentTarget.dataset.deckId;
        if (deckId) {
            location.href = `/study?deck_id=${deckId}`;
        } else {
            console.error("Study button clicked, but deck ID is missing.");
        }
      });
    }

    const optionsButton = deckCard.querySelector(".deck-options-btn");
    if (optionsButton) {
      optionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        closeActiveMenu();
        showDeckMenu(optionsButton, deck);
      });
    }

    deckCard.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-5px)";
      this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.1)";
    });
    deckCard.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.boxShadow = "";
    });
    return deckCard;
  }

  function createDeckMenuElement(deck) {
    const menu = document.createElement('ul');
    menu.className = 'deck-context-menu';
    menu.innerHTML = `
        <li><button data-action="study"><i class="fas fa-book-open"></i> Study Deck</button></li>
        <li><button data-action="edit"><i class="fas fa-pencil-alt"></i> Edit Deck</button></li>
        <li><button data-action="delete" class="delete-option"><i class="fas fa-trash"></i> Delete Deck</button></li>
    `;
    menu.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        handleMenuAction(e.currentTarget.dataset.action, deck);
        closeActiveMenu();
      });
    });
    return menu;
  }

  function showDeckMenu(triggerButton, deck) {
    if (!triggerButton || !deck) return;
    const menu = createDeckMenuElement(deck);
    triggerButton.appendChild(menu);
    triggerButton.classList.add('menu-open');
    activeMenuButton = triggerButton;
  }

  function closeActiveMenu() {
    if (activeMenuButton) {
      const menu = activeMenuButton.querySelector('.deck-context-menu');
      if (menu) menu.remove();
      activeMenuButton.classList.remove('menu-open');
      activeMenuButton = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (activeMenuButton) {
      const menuElement = activeMenuButton.querySelector('.deck-context-menu');
      // Check if the click is outside the button AND outside the menu itself
      if (menuElement && !activeMenuButton.contains(e.target) && !menuElement.contains(e.target)) {
        closeActiveMenu();
      }
    }
  });

  function handleMenuAction(action, deck) {
    if (!deck || !deck.id) {
        console.error("handleMenuAction called with invalid deck:", deck);
        return;
    }
    switch (action) {
      case 'study':
        location.href = `/study?deck_id=${deck.id}`;
        break;
      case 'edit':
        location.href = `/decks/${deck.id}/edit`;
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete the deck "${escapeHtml(deck.name)}"? This action cannot be undone.`)) {
          deleteDeck(deck.id, deck.name);
        }
        break;
      default:
        console.warn("Unknown menu action:", action);
    }
  }

  async function deleteDeck(deckId, deckName) {
    const deckCardElement = document.querySelector(`.deck-card[data-deck-id="${deckId}"]`);
    if (deckCardElement) deckCardElement.style.opacity = 0.5;

    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' }
      });
      const result = await response.json();

      if (response.ok && result.success) {
        if (deckCardElement) {
          deckCardElement.classList.add('fade-out');
          deckCardElement.addEventListener('animationend', () => {
            deckCardElement.remove();
            loadDashboardStats(); 
            if (decksGrid && decksGrid.children.length === 0) {
                decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
            }
            if (decksLoadedSuccessfully && deckFilterSelect) loadDecksForFilter(); 
          }, { once: true });
        } else {
          // If element not found, just reload data
          if(decksGrid) loadDecks(); 
          if (decksLoadedSuccessfully && deckFilterSelect) loadDecksForFilter();
        }
         alert(`Deck "${escapeHtml(deckName)}" deleted successfully.`); // User feedback
      } else {
        console.error("Error deleting deck:", result);
        alert(`Error deleting deck "${escapeHtml(deckName)}": ${result.errors?.general || result.message || 'Unknown error'}`);
        if (deckCardElement) deckCardElement.style.opacity = 1;
      }
    } catch (error) {
      console.error("Failed to delete deck (network error):", error);
      alert(`An unexpected error occurred while deleting deck "${escapeHtml(deckName)}".`);
      if (deckCardElement) deckCardElement.style.opacity = 1;
    }
  }

  async function loadDecks() {
    if (!decksGrid) {
        console.warn("decksGrid element not found. Cannot load decks.");
        return;
    }
    decksGrid.innerHTML = "<p>Loading decks...</p>";
    try {
      const response = await fetch("/api/decks");
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();

      if (result.success && result.decks) {
        decksGrid.innerHTML = ""; // Clear loading message
        if (result.decks.length === 0) {
          decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
        } else {
          result.decks.forEach((deck, index) => {
            const deckCardElement = createDeckCardElement(deck);
            deckCardElement.style.animationDelay = `${index * 0.05}s`;
            decksGrid.appendChild(deckCardElement);
          });
        }
      } else {
        decksGrid.innerHTML = `<p>Error loading decks: ${escapeHtml(result.errors?.general) || 'Unknown error'}</p>`;
      }
    } catch (error) {
      console.error("Failed to load decks:", error);
      decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
    }
  }

  async function loadDashboardStats() {
    // console.log("loadDashboardStats called");
    if (statsTotalDecksElement) statsTotalDecksElement.textContent = '...';
    if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = '...';
    if (statsUserPointsElement) { // Check if element exists
        statsUserPointsElement.textContent = '...';
    } else {
        console.warn("statsUserPointsElement not found in DOM.");
    }

    try {
      const response = await fetch("/api/stats/dashboard");
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      // console.log("Dashboard stats API result:", result);

      if (result.success && result.stats) {
        const stats = result.stats;
        // console.log("Stats object:", stats);
        if (statsTotalDecksElement) statsTotalDecksElement.textContent = stats.total_decks !== undefined ? stats.total_decks : 'N/A';
        if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = stats.cards_mastered !== undefined ? stats.cards_mastered : 'N/A';
        
        if (statsUserPointsElement) {
            statsUserPointsElement.textContent = stats.points !== undefined ? stats.points.toLocaleString() : 'N/A';
        }
      } else {
        console.error("API returned error for dashboard stats:", result);
        if (statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
        if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
        if (statsUserPointsElement) statsUserPointsElement.textContent = 'Error';
      }
    } catch (error) {
      console.error("Error during loadDashboardStats:", error);
      if (statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
      if (statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
      if (statsUserPointsElement) statsUserPointsElement.textContent = 'Error';
    }
  }

  // --- Card Browser Tab Functions ---
  async function loadTagsForFilter() {
    if (!tagFilterSelect) {
        console.warn("tagFilterSelect element not found.");
        return;
    }
    // console.log("Attempting to load tags for filter...");
    // Simplified loading message handling
    tagFilterSelect.innerHTML = '<option value="" disabled selected>Loading tags...</option>';
    
    try {
        const response = await fetch("/api/tags");
        if (!response.ok) {
            console.error("Failed to fetch tags:", response.status);
            tagFilterSelect.innerHTML = '<option value="" disabled selected>Error loading tags</option>';
            tagsLoadedSuccessfully = false;
            return;
        }
        const result = await response.json();
        tagFilterSelect.innerHTML = ''; 

        if (result.success && result.tags) {
            if (result.tags.length === 0) {
                const noTagsOption = document.createElement('option');
                noTagsOption.textContent = "No tags available";
                noTagsOption.disabled = true; 
                tagFilterSelect.appendChild(noTagsOption);
            } else {
                result.tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.id;
                    option.textContent = escapeHtml(tag.name);
                    tagFilterSelect.appendChild(option);
                });
            }
            // console.log("Tags loaded and populated into select:", result.tags.length);
            tagsLoadedSuccessfully = true;
        } else {
            console.error("API error fetching tags:", result.errors);
            tagFilterSelect.innerHTML = '<option value="" disabled selected>Error: No tags or API issue</option>';
            tagsLoadedSuccessfully = false;
        }
    } catch (error) {
        console.error("Error in loadTagsForFilter:", error);
        tagFilterSelect.innerHTML = '<option value="" disabled selected>Server error for tags</option>';
        tagsLoadedSuccessfully = false;
    }
  }

  async function loadDecksForFilter() {
    if (!deckFilterSelect) {
        console.warn("deckFilterSelect element not found.");
        return;
    }
    // console.log("Attempting to load decks for filter...");
    const defaultAllDecksOptionHTML = '<option value="">All Decks</option>'; // Keep as HTML string
    deckFilterSelect.innerHTML = '<option value="" disabled selected>Loading decks...</option>';

    try {
        const response = await fetch("/api/decks"); // This fetches ALL user decks
        if (!response.ok) {
            console.error("Failed to fetch decks for filter:", response.status);
            deckFilterSelect.innerHTML = defaultAllDecksOptionHTML + '<option value="" disabled>Error loading decks</option>';
            deckFilterSelect.value = ""; 
            decksLoadedSuccessfully = false;
            return;
        }
        const result = await response.json();
        deckFilterSelect.innerHTML = defaultAllDecksOptionHTML; 

        if (result.success && result.decks) {
            if (result.decks.length > 0) {
                result.decks.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.id;
                    option.textContent = escapeHtml(deck.name);
                    deckFilterSelect.appendChild(option);
                });
            }
            // console.log("Decks loaded for filter:", result.decks.length);
            decksLoadedSuccessfully = true;
        } else {
            console.error("API error fetching decks for filter:", result.errors);
            decksLoadedSuccessfully = false;
        }
        deckFilterSelect.value = ""; 
    } catch (error) {
        console.error("Error in loadDecksForFilter:", error);
        deckFilterSelect.innerHTML = defaultAllDecksOptionHTML + '<option value="" disabled>Server error for decks</option>';
        deckFilterSelect.value = "";
        decksLoadedSuccessfully = false;
    }
  }

  function updateCreateCustomDeckButtonState() {
    if (!createCustomDeckBtn || !cardResultsTbody) return;
    const selectedCheckboxes = cardResultsTbody.querySelectorAll('input.card-select-checkbox:checked');
    createCustomDeckBtn.disabled = selectedCheckboxes.length === 0;
  }

  function renderCardResults(cards) {
    if (!cardResultsTbody || !cardBrowserInitialMessage || !loadingCardsMessage || !noCardsFoundMessage || !cardResultsTable) {
        console.error("renderCardResults: One or more card browser display elements are missing.");
        return;
    }
    // console.log("Rendering card results. Received cards count:", cards ? cards.length : 0);

    cardResultsTbody.innerHTML = ''; 
    cardBrowserInitialMessage.style.display = 'none';
    loadingCardsMessage.style.display = 'none';

    if (!cards || cards.length === 0) {
        noCardsFoundMessage.style.display = 'block';
        cardResultsTable.style.display = 'none';
        if(selectAllCardsCheckbox) {
            selectAllCardsCheckbox.checked = false;
            selectAllCardsCheckbox.disabled = true;
        }
        updateCreateCustomDeckButtonState();
        return;
    }

    noCardsFoundMessage.style.display = 'none';
    cardResultsTable.style.display = 'table';
    if(selectAllCardsCheckbox) selectAllCardsCheckbox.disabled = false;

    cards.forEach(card => {
        const row = cardResultsTbody.insertRow();
        row.dataset.noteId = card.note_id; 
        row.dataset.flashcardId = card.flashcard_id;

        const tagsArray = card.tags ? card.tags.split(',').map(t => t.trim()).filter(t => t) : [];
        const tagsHtml = tagsArray.length > 0 ? tagsArray.map(tag => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join(' ') : '<i>No tags</i>';

        row.innerHTML = `
            <td><input type="checkbox" class="card-select-checkbox" data-note-id="${card.note_id}"></td>
            <td class="card-content-cell" title="${escapeHtml(card.front)}">${escapeHtml(card.front)}</td>
            <td class="card-content-cell" title="${escapeHtml(card.back)}">${escapeHtml(card.back)}</td>
            <td>${escapeHtml(card.deck_name)}</td>
            <td>${tagsHtml}</td>
        `;
        const checkbox = row.querySelector('.card-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                updateCreateCustomDeckButtonState();
                if (selectAllCardsCheckbox) {
                    const allCardCheckboxes = cardResultsTbody.querySelectorAll('.card-select-checkbox');
                    const allChecked = Array.from(allCardCheckboxes).every(cb => cb.checked);
                    selectAllCardsCheckbox.checked = allChecked && allCardCheckboxes.length > 0;
                }
            });
        }
    });
    updateCreateCustomDeckButtonState(); 
  }

  async function searchUserCards() {
    if (!cardSearchInput || !tagFilterSelect || !deckFilterSelect || 
        !cardResultsTable || !noCardsFoundMessage || !cardBrowserInitialMessage || 
        !loadingCardsMessage || !cardResultsTbody) {
        console.error("searchUserCards: Critical DOM elements missing.");
        // Display a user-friendly message if possible
        if(noCardsFoundMessage) {
            noCardsFoundMessage.textContent = "Error: UI components for search are missing. Please refresh.";
            noCardsFoundMessage.style.display = 'block';
        }
        if(loadingCardsMessage) loadingCardsMessage.style.display = 'none';
        if(cardBrowserInitialMessage) cardBrowserInitialMessage.style.display = 'none';
        if(cardResultsTable) cardResultsTable.style.display = 'none';
        return;
    }

    const query = cardSearchInput.value.trim();
    const selectedTagOptions = Array.from(tagFilterSelect.selectedOptions);
    const tagIds = selectedTagOptions.map(option => option.value).filter(value => value !== "").join(',');
    const selectedDeckId = deckFilterSelect.value;

    // console.log(`Performing card search: Query='${query}', Tags='${tagIds}', DeckID='${selectedDeckId}'`);

    loadingCardsMessage.style.display = 'block';
    cardResultsTable.style.display = 'none';
    noCardsFoundMessage.style.display = 'none';
    cardBrowserInitialMessage.style.display = 'none';
    
    if(createCustomDeckBtn) createCustomDeckBtn.disabled = true;
    if(selectAllCardsCheckbox) {
        selectAllCardsCheckbox.checked = false;
        selectAllCardsCheckbox.disabled = true;
    }

    try {
        const apiUrl = `/api/cards/search?query=${encodeURIComponent(query)}&tags=${encodeURIComponent(tagIds)}&deck_id=${encodeURIComponent(selectedDeckId)}`;
        const response = await fetch(apiUrl);
        
        let result;
        try {
            result = await response.json();
        } catch (jsonError) {
             console.error("Failed to parse card search API JSON response:", jsonError);
             const textResponse = await response.text(); 
             console.error("Card search API response text:", textResponse);
             throw new Error(`API returned non-JSON response (Status: ${response.status}). Body: ${textResponse.substring(0, 200)}...`);
        }

        if (response.ok && result.success) {
            renderCardResults(result.cards);
        } else {
            let errorMessage = result.errors?.general || result.message || 'Unknown error from API';
            console.error("Card search API returned error:", errorMessage, result);
            noCardsFoundMessage.textContent = `Error searching cards: ${escapeHtml(errorMessage)}`;
            noCardsFoundMessage.style.display = 'block';
        }
    } catch (error) {
        console.error("Failed to search cards (network/fetch error):", error);
        noCardsFoundMessage.textContent = `An unexpected error occurred: ${escapeHtml(error.message || String(error))}`;
        noCardsFoundMessage.style.display = 'block';
    } finally {
         if(loadingCardsMessage) loadingCardsMessage.style.display = 'none';
         updateCreateCustomDeckButtonState(); 
    }
  }
  
  // Define debouncedSearchUserCards *after* searchUserCards is defined
  const debouncedSearchUserCards = debounce(searchUserCards, 400);

  // Event Listeners for Card Browser
  if (applyCardFilterBtn) {
    applyCardFilterBtn.addEventListener('click', searchUserCards);
  }

  if (cardSearchInput) {
    cardSearchInput.addEventListener('input', debouncedSearchUserCards);
    cardSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            searchUserCards();
        }
    });
  }
  
  if (clearCardFilterBtn) {
    clearCardFilterBtn.addEventListener('click', () => {
        if (cardSearchInput) cardSearchInput.value = '';
        if (deckFilterSelect) deckFilterSelect.value = ''; 
        if (tagFilterSelect) {
            Array.from(tagFilterSelect.options).forEach(option => option.selected = false);
        }
        
        if(cardResultsTbody) cardResultsTbody.innerHTML = '';
        if(cardResultsTable) cardResultsTable.style.display = 'none';
        if(noCardsFoundMessage) noCardsFoundMessage.style.display = 'none';
        if(cardBrowserInitialMessage) cardBrowserInitialMessage.style.display = 'block';
        if(selectAllCardsCheckbox) {
            selectAllCardsCheckbox.checked = false;
            selectAllCardsCheckbox.disabled = true;
        }
        updateCreateCustomDeckButtonState();
        // console.log("Card browser filters cleared.");
    });
  }

  if (selectAllCardsCheckbox) {
    selectAllCardsCheckbox.addEventListener('change', () => {
        if (!cardResultsTbody) return;
        const checkboxes = cardResultsTbody.querySelectorAll('.card-select-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAllCardsCheckbox.checked;
        });
        updateCreateCustomDeckButtonState();
    });
  }

  if (createCustomDeckBtn) {
    createCustomDeckBtn.addEventListener('click', async () => {
        if (!cardResultsTbody) {
            alert("Card results table not found. Cannot create deck.");
            return;
        }
        const selectedCheckboxes = cardResultsTbody.querySelectorAll('input.card-select-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            alert("Please select at least one card to create a deck.");
            return;
        }

        const noteIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.noteId));
        
        const defaultDeckName = "Custom Study " + new Date().toLocaleDateString().replace(/\//g, '-');
        const deckName = prompt("Enter a name for your new custom deck:", defaultDeckName);
        
        if (!deckName || deckName.trim() === "") {
            if (deckName !== null) { // User didn't press Cancel
                 alert("Deck name cannot be empty.");
            }
            return; 
        }

        createCustomDeckBtn.disabled = true;
        createCustomDeckBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        try {
            const response = await fetch('/api/decks/create-custom', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name: deckName.trim(), note_ids: noteIds })
            });
            const result = await response.json();

            if (response.ok && result.success && result.deck) { // Check for result.deck
                alert(`Deck "${escapeHtml(result.deck.name)}" created successfully with ${result.deck.card_count || 0} cards!`);
                
                if(decksGrid) loadDecks(); 
                loadDashboardStats();
                if (decksLoadedSuccessfully && deckFilterSelect) loadDecksForFilter();

                const decksTabButton = document.querySelector('.tab-button[data-tab="decks"]');
                if (decksTabButton) {
                    decksTabButton.click(); // Switch to decks tab
                }

                // Uncheck selected cards in browser
                cardResultsTbody.querySelectorAll('input.card-select-checkbox:checked').forEach(cb => cb.checked = false);
                if(selectAllCardsCheckbox) selectAllCardsCheckbox.checked = false;
                updateCreateCustomDeckButtonState();

            } else {
                let errorMessage = "Unknown error occurred.";
                if (result.errors) {
                    if (result.errors.general) errorMessage = result.errors.general;
                    else if (result.errors.name) errorMessage = `Name error: ${result.errors.name}`;
                    else if (result.errors.note_ids) errorMessage = `Card selection error: ${result.errors.note_ids}`;
                    else errorMessage = JSON.stringify(result.errors);
                } else if (result.message) {
                    errorMessage = result.message;
                } else if (!response.ok) {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
                console.error("Error creating custom deck:", result);
                alert(`Error creating deck: ${escapeHtml(errorMessage)}`);
            }
        } catch (error) {
            console.error("Error creating custom deck (fetch exception):", error);
            alert("An unexpected network error occurred while creating the deck. Please check your connection and try again.");
        } finally {
            createCustomDeckBtn.disabled = false; // Re-enable button
            createCustomDeckBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Deck from Selected';
        }
    });
  }
  
  // --- Initial Load Logic ---
  function initializeDashboard() {
    const initialActiveTabButton = document.querySelector(".tab-button.active") || document.querySelector('.tab-button[data-tab="decks"]');
    if (initialActiveTabButton) {
        const initialTargetTab = initialActiveTabButton.dataset.tab;
        
        // Ensure only the correct tab button and content are active
        tabButtons.forEach(btn => btn.classList.remove("active"));
        tabContents.forEach(content => content.classList.remove("active"));
        initialActiveTabButton.classList.add("active");
        const initialActiveContent = document.getElementById(`${initialTargetTab}-content`);
        if (initialActiveContent) {
            initialActiveContent.classList.add("active");
        } else {
            console.error(`Initial active tab content for '${initialTargetTab}' not found.`);
            // Fallback to showing decks tab if target not found
            const decksContent = document.getElementById('decks-content');
            const decksButton = document.querySelector('.tab-button[data-tab="decks"]');
            if(decksButton) decksButton.classList.add('active');
            if(decksContent) decksContent.classList.add('active');
        }

        // Load data based on the active tab
        if (initialTargetTab === 'browse') {
            if (tagFilterSelect) loadTagsForFilter(); // Check element existence
            if (deckFilterSelect) loadDecksForFilter(); // Check element existence
            if (cardResultsTbody && cardResultsTbody.children.length === 0 && 
                loadingCardsMessage && (loadingCardsMessage.style.display === 'none' || !loadingCardsMessage.style.display) &&
                cardBrowserInitialMessage) {
                cardBrowserInitialMessage.style.display = 'block';
            }
        } else if (initialTargetTab === 'decks') {
            if(decksGrid) loadDecks();
            loadDashboardStats();
        }
    } else { 
        // Fallback if no tab is initially marked active
        const decksContent = document.getElementById('decks-content');
        const decksButton = document.querySelector('.tab-button[data-tab="decks"]');
        if (decksContent && decksButton) {
            decksButton.classList.add('active');
            decksContent.classList.add('active');
            if(decksGrid) loadDecks();
            loadDashboardStats();
        } else {
            console.error("Default 'decks' tab or its button not found for fallback initialization.");
        }
    }
    closeActiveMenu(); // Ensure any stray menus are closed
  }

  initializeDashboard(); // Call the initialization function
});