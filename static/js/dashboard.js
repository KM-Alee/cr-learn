// static/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const decksGrid = document.querySelector(".decks-grid");
  const statsTotalDecksElement = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p");
  const statsCardsMasteredElement = document.querySelector(".stats-grid .stat-card:nth-child(2) .stat-info p");
  const statsStudyTimeElement = document.querySelector(".stats-grid .stat-card:nth-child(3) .stat-info p");

  let activeMenuButton = null; // To keep track of the button that opened the menu

  // Helper to prevent XSS (Corrected implementation)
  function escapeHtml(unsafe) {
      if (typeof unsafe !== 'string') return '';
      return unsafe
           .replace(/&/g, "&")
           .replace(/</g, "<")
           .replace(/>/g, ">")
           .replace(/"/g, "\"")
           .replace(/'/g, "'");
   }


  // Function to create a single deck card DOM element
  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up";
    deckCard.dataset.deckId = deck.id; // Store deck ID on the card element

    // Mastered percentage is a placeholder from backend GET /api/decks for now (set to 0)
    const masteredPercentage = deck.mastered_percentage !== undefined ? deck.mastered_percentage.toFixed(0) : 0;
    // ** This uses the card_count value received directly from the backend API **
    const cardCount = deck.card_count || 0; 
    const tagsHtml = deck.tags ? deck.tags.split(',').map(tag => `<span class="tag-item">${escapeHtml(tag.trim())}</span>`).join(' ') : 'No tags';

    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${escapeHtml(deck.name)}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
         <button class="btn icon-btn deck-options-btn" data-deck-id="${deck.id}" title="More options">
            <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
      ${deck.description ? `<p style="font-size: 0.9em; color: #555; margin-bottom: 10px;">${escapeHtml(deck.description)}</p>` : ''}
      <div class="deck-tags-list" style="font-size: 0.8em; color: #777; margin-bottom: 10px;">
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
          Study Now
        </button>
      </div>
    `;

     // Attach event listener to the Study Now button
     const studyButton = deckCard.querySelector(".study-now-btn");
     if(studyButton) {
         studyButton.addEventListener('click', (e) => {
             e.stopPropagation(); // Prevent click from bubbling up
             location.href = `/study?deck_id=${e.currentTarget.dataset.deckId}`;
         });
     }

    // Attach event listener to the Options (ellipsis) button
    const optionsButton = deckCard.querySelector(".deck-options-btn");
    if (optionsButton) {
      optionsButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent click from bubbling up to document
        
        // Close any other open menu
        closeActiveMenu();
        // Show the menu for this button
        showDeckMenu(optionsButton, deck); // Pass the button and deck data
      });
    }

    // Add hover effect (already exists, keep it)
    deckCard.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-5px)";
      this.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.15)";
    });

    deckCard.addEventListener("mouseleave", function () {
      this.style.transform = "";
      this.style.boxShadow = "";
    });

    return deckCard;
  }


    // --- Menu Handling Functions ---
    function createDeckMenuElement(deck) {
        const menu = document.createElement('ul');
        menu.className = 'deck-context-menu'; // Uses the styles defined in dashboard.html/css
        menu.innerHTML = `
            <li><button data-action="study"><i class="fas fa-book-open"></i> Study Deck</button></li>
            <li><button data-action="edit"><i class="fas fa-pencil-alt"></i> Edit Deck</button></li>
            <li><button data-action="delete" class="delete-option"><i class="fas fa-trash"></i> Delete Deck</button></li>
        `;

        // Add event listeners to menu buttons
        menu.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent menu click from closing menu immediately
                const action = e.currentTarget.dataset.action;
                handleMenuAction(action, deck); // Pass action and deck data
                closeActiveMenu(); // Close menu after action is handled
            });
        });

        return menu;
    }

    function showDeckMenu(triggerButton, deck) {
        const menu = createDeckMenuElement(deck);
        // Append the menu *to the button* so it's positioned relative to it
        triggerButton.appendChild(menu);

        // Add a class to the button to signal that the menu is open (for CSS transitions)
        triggerButton.classList.add('menu-open');

        activeMenuButton = triggerButton; // Set the button as the active menu trigger
    }

    function closeActiveMenu() {
        if (activeMenuButton) {
            // Find the menu element inside the active button
            const menu = activeMenuButton.querySelector('.deck-context-menu');
            if (menu) {
                 menu.remove(); // Remove the menu element
            }
            activeMenuButton.classList.remove('menu-open'); // Remove the class
            activeMenuButton = null; // Reset the active menu button
        }
    }

    // Close menu when clicking anywhere on the page EXCEPT the active menu button or inside the menu
    document.addEventListener('click', (e) => {
        // Check if a menu is open AND the click target is NOT the active menu button
        // AND is NOT inside the menu element itself
        if (activeMenuButton) {
            const menuElement = activeMenuButton.querySelector('.deck-context-menu');
            if (menuElement && !activeMenuButton.contains(e.target) && !menuElement.contains(e.target)) {
                 closeActiveMenu();
            }
            // Edge case: if click is on the active menu button itself, the optionsButton listener handles it
        }
    });


    // --- Handle Menu Actions ---
    function handleMenuAction(action, deck) {
        switch (action) {
            case 'study':
                location.href = `/study?deck_id=${deck.id}`;
                break;
            case 'edit':
                location.href = `/decks/${deck.id}/edit`;
                break;
            case 'delete':
                if (confirm(`Are you sure you want to delete the deck "${deck.name}"? This action cannot be undone.`)) {
                    deleteDeck(deck.id, deck.name); // Call the delete API function
                }
                break;
            default:
                console.warn("Unknown menu action:", action);
        }
    }

    // --- Delete Deck API Call ---
    async function deleteDeck(deckId, deckName) {
        try {
            // Find the deck card element to potentially remove it later
            const deckCardElement = document.querySelector(`.deck-card[data-deck-id="${deckId}"]`);
             // Optional: Add loading indicator or visual cue
            if(deckCardElement) deckCardElement.style.opacity = 0.5;


            const response = await fetch(`/api/decks/${deckId}`, {
                method: 'DELETE',
                 headers: { 'Accept': 'application/json' }
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert(`Deck "${deckName}" deleted successfully.`);
                if (deckCardElement) {
                    // Use the fade-out CSS class if defined
                    deckCardElement.classList.add('fade-out');
                    deckCardElement.addEventListener('animationend', () => {
                        deckCardElement.remove();
                         loadDashboardStats(); // Refresh stats after removing card
                    }, { once: true });
                } else {
                     // Fallback: If we can't find the element to animate, just reload decks
                     loadDecks();
                }

            } else {
                console.error("Error deleting deck:", result);
                alert(`Error deleting deck "${deckName}": ${result.errors?.general || result.message || 'Unknown error'}`);
                 if(deckCardElement) deckCardElement.style.opacity = 1; // Remove cue
            }
        } catch (error) {
            console.error("Failed to delete deck:", error);
            alert(`An unexpected error occurred while deleting deck "${deckName}".`);
             if(deckCardElement) deckCardElement.style.opacity = 1; // Remove cue
        }
    }

    // --- Fetch Decks ---
    async function loadDecks() {
        // Optional: Show a loading indicator for the decks grid
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
            decksGrid.innerHTML = ""; // Clear loading/previous content
            if (result.decks.length === 0) {
              decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
               // Update total decks stat if no decks found
               if (statsTotalDecksElement) statsTotalDecksElement.textContent = 0;
            } else {
              result.decks.forEach((deck, index) => {
                const deckCardElement = createDeckCardElement(deck); // Calls createDeckCardElement
                deckCardElement.style.animationDelay = `${index * 0.1}s`; // Apply animation delay
                decksGrid.appendChild(deckCardElement);
              });
                // Update total decks stat based on fetched decks count
                if (statsTotalDecksElement) {
                    statsTotalDecksElement.textContent = result.decks.length;
                }
            }
          } else {
            decksGrid.innerHTML = `<p>Error loading decks: ${result.errors?.general || 'Unknown error'}</p>`;
          }
        } catch (error) {
          console.error("Failed to load decks:", error);
          decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
        }
      }


  // --- Fetch Dashboard Stats ---
  async function loadDashboardStats() {
      try {
          // Optional: Show loading indicators in stats cards
          if(statsTotalDecksElement) statsTotalDecksElement.textContent = '...';
          if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = '...';
          if(statsStudyTimeElement) statsStudyTimeElement.textContent = '...';


          const response = await fetch("/api/stats/dashboard");
          if (!response.ok) {
              console.error("Failed to fetch dashboard stats", response.status);
              if(statsTotalDecksElement) statsTotalDecksElement.textContent = 'N/A';
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'N/A';
               return;
          }
          const result = await response.json();

          if (result.success && result.stats) {
              const stats = result.stats;
              // Update stats elements using data from the API
              // Total Decks stat is handled by loadDecks based on fetched count, but updating here is also okay
               if(statsTotalDecksElement) statsTotalDecksElement.textContent = stats.total_decks !== undefined ? stats.total_decks : 'N/A';
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = stats.cards_mastered !== undefined ? stats.cards_mastered : 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = stats.total_study_time_formatted || 'N/A';
          } else {
               console.error("API returned error for dashboard stats:", result);
               if(statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
               if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
               if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
          }

      } catch (error) {
          console.error("Error during loadDashboardStats:", error);
           if(statsTotalDecksElement) statsTotalDecksElement.textContent = 'Error';
           if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
           if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
      }
  }


  // --- Initial Load ---
  loadDecks(); // This will call createDeckCardElement
  loadDashboardStats(); // This updates the stats numbers


    // Ensure any existing menus are closed on page load (safety)
     closeActiveMenu();
});