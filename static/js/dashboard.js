// static/js/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const decksGrid = document.querySelector(".decks-grid");
  // Get DOM elements for dashboard stats
  const statsTotalDecksElement = document.querySelector(".stats-grid .stat-card:nth-child(1) .stat-info p");
  const statsCardsMasteredElement = document.querySelector(".stats-grid .stat-card:nth-child(2) .stat-info p");
  const statsStudyTimeElement = document.querySelector(".stats-grid .stat-card:nth-child(3) .stat-info p");
  // Add stat element for streak if you add it to dashboard.html later
  function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }
  function createDeckCardElement(deck) {
    const deckCard = document.createElement("div");
    deckCard.className = "deck-card fade-in-up";

    // Mastered percentage is a placeholder from backend GET /api/decks for now (set to 0)
    // If you implement mastered cards count in backend, update logic here
    const masteredPercentage = deck.mastered_percentage !== undefined ? deck.mastered_percentage.toFixed(0) : 0;
    const cardCount = deck.card_count || 0;
    const tagsHtml = deck.tags ? deck.tags.split(',').map(tag => `<span class="tag-item">${tag.trim()}</span>`).join(' ') : 'No tags';

    deckCard.innerHTML = `
      <div class="deck-header">
        <h3>${escapeHtml(deck.name)}</h3>
        <span class="card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
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
        <button class="btn secondary-btn" onclick="location.href='/study?deck_id=${deck.id}'">
          Study Now
        </button>
        <button class="btn icon-btn deck-options-btn" data-deck-id="${deck.id}" title="More options">
          <i class="fas fa-ellipsis-v"></i>
        </button>
         <button class="btn icon-btn edit-deck-btn" data-deck-id="${deck.id}" title="Edit Deck">
            <i class="fas fa-pencil-alt"></i>
        </button>
      </div>
    `;

     // Add event listeners for dynamically added buttons/elements
    const editButton = deckCard.querySelector(".edit-deck-btn");
    if (editButton) {
        editButton.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent card hover/click effects
            const deckId = e.currentTarget.dataset.deckId;
            location.href = `/decks/${deckId}/edit`; // Navigate to edit page
        });
    }

    // Ellipsis menu functionality (placeholder)
    const optionsButton = deckCard.querySelector(".deck-options-btn");
    if (optionsButton) {
      optionsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        const deckId = e.currentTarget.dataset.deckId;
        alert(`Options menu for deck ID: ${deckId}. (Not implemented yet)`);
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

   // Helper to prevent XSS
    

  async function loadDecks() {
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
        decksGrid.innerHTML = "";
        if (result.decks.length === 0) {
          decksGrid.innerHTML = "<p>No decks found. Create your first deck!</p>";
        } else {
          result.decks.forEach((deck, index) => {
            const deckCardElement = createDeckCardElement(deck);
            deckCardElement.style.animationDelay = `${index * 0.1}s`;
            decksGrid.appendChild(deckCardElement);
          });
        }
        // Total decks stat is automatically updated here by counting rendered decks
        if (statsTotalDecksElement) {
            statsTotalDecksElement.textContent = result.decks.length;
        }
      } else {
        decksGrid.innerHTML = `<p>Error loading decks: ${result.errors?.general || 'Unknown error'}</p>`;
      }
    } catch (error) {
      console.error("Failed to load decks:", error);
      decksGrid.innerHTML = "<p>Could not load decks. Please try again later.</p>";
    }
  }

  // --- New function to load dashboard stats ---
  async function loadDashboardStats() {
      try {
          // Optionally show loading indicators in stats cards
          if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = '...';
          if(statsStudyTimeElement) statsStudyTimeElement.textContent = '...';
          // if(statsStreakElement) statsStreakElement.textContent = '...'; // If you add streak stat

          const response = await fetch("/api/stats/dashboard");
          if (!response.ok) {
              console.error("Failed to fetch dashboard stats", response.status);
              // Set error state or default
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'N/A';
               return; // Stop if fetch fails
          }
          const result = await response.json();

          if (result.success && result.stats) {
              const stats = result.stats;
               // Update stats elements using data from the API
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = stats.cards_mastered !== undefined ? stats.cards_mastered : 'N/A';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = stats.total_study_time_formatted || 'N/A'; // Use formatted time
              // if(statsStreakElement) statsStreakElement.textContent = stats.review_streak_days !== undefined ? `${stats.review_streak_days} days` : 'N/A'; // Update streak
          } else {
               console.error("API returned error for dashboard stats:", result);
              if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
              if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
          }

      } catch (error) {
          console.error("Error during loadDashboardStats:", error);
           if(statsCardsMasteredElement) statsCardsMasteredElement.textContent = 'Error';
           if(statsStudyTimeElement) statsStudyTimeElement.textContent = 'Error';
      }
  }


  // --- Initial Load ---
  loadDecks(); // Load decks grid
  loadDashboardStats(); // Load the summary statistics
});