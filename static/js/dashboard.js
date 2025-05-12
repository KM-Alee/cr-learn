document.addEventListener("DOMContentLoaded", () => {
    // Animation for deck cards
    const deckCards = document.querySelectorAll(".deck-card")
  
    deckCards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.1}s`
  
      // Add hover effect
      card.addEventListener("mouseenter", function () {
        this.style.transform = "translateY(-10px)"
        this.style.boxShadow = "0 15px 30px rgba(0, 0, 0, 0.2)"
      })
  
      card.addEventListener("mouseleave", function () {
        this.style.transform = ""
        this.style.boxShadow = ""
      })
    })
  
    // Ellipsis menu functionality
    const menuButtons = document.querySelectorAll(".icon-btn")
  
    menuButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.stopPropagation()
        // In a real app, this would show a dropdown menu
        alert("Menu options: Edit, Delete, Share, etc.")
      })
    })
  
    // Simulate loading new decks (in a real app, this would fetch from an API)
    function loadMoreDecks() {
      const decksGrid = document.querySelector(".decks-grid")
      const newDeckNames = ["Algorithms", "Machine Learning", "React Hooks"]
      const progressValues = [60, 15, 90]
  
      newDeckNames.forEach((name, index) => {
        const deckCard = document.createElement("div")
        deckCard.className = "deck-card fade-in-up"
        deckCard.style.animationDelay = `${index * 0.1}s`
  
        deckCard.innerHTML = `
          <div class="deck-header">
            <h3>${name}</h3>
            <span class="card-count">${Math.floor(Math.random() * 40) + 10} cards</span>
          </div>
          <div class="deck-progress">
            <div class="progress-bar">
              <div class="progress" style="width: ${progressValues[index]}%"></div>
            </div>
            <span class="progress-text">${progressValues[index]}% Mastered</span>
          </div>
          <div class="deck-actions">
            <button class="btn secondary-btn" onclick="location.href='study.html?deck=${name.toLowerCase().replace(" ", "-")}'">
              Study Now
            </button>
            <button class="btn icon-btn">
              <i class="fas fa-ellipsis-v"></i>
            </button>
          </div>
        `
  
        // Add hover effect
        deckCard.addEventListener("mouseenter", function () {
          this.style.transform = "translateY(-10px)"
          this.style.boxShadow = "0 15px 30px rgba(0, 0, 0, 0.2)"
        })
  
        deckCard.addEventListener("mouseleave", function () {
          this.style.transform = ""
          this.style.boxShadow = ""
        })
  
        decksGrid.appendChild(deckCard)
      })
    }
  
    // Load more decks after a delay (simulating async loading)
    setTimeout(loadMoreDecks, 1500)
  })  