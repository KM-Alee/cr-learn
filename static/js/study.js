document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const flashcard = document.getElementById("flashcard")
  const cardFront = document.getElementById("card-front")
  const cardBack = document.getElementById("card-back")
  const progress = document.querySelector(".progress")
  const cardCounter = document.getElementById("card-counter")
  const deckTitle = document.getElementById("deck-title")
  const prevBtn = document.getElementById("prev-card")
  const nextBtn = document.getElementById("next-card")
  const deckSelect = document.getElementById("deck-select")
  const difficultyBtns = document.querySelectorAll(".control-btn")

  // State
  let currentCardIndex = 0
  let currentDeck = "javascript"
  const studyHistory = []

  // Decks data
  const decks = {
    javascript: [
      {
        question: "What is a closure?",
        answer:
          "A function that retains access to its lexical scope even when the function is executed outside that scope.",
      },
      {
        question: "What is an arrow function?",
        answer: "A shorter syntax for writing functions using => with lexical 'this' binding.",
      },
      {
        question: "What is the difference between let and var?",
        answer:
          "let is block-scoped while var is function-scoped. let doesn't allow redeclaration and isn't hoisted in the same way as var.",
      },
      {
        question: "What is a Promise?",
        answer:
          "An object representing the eventual completion or failure of an asynchronous operation and its resulting value.",
      },
      {
        question: "What is event bubbling?",
        answer:
          "A process where an event triggered on a nested element will also trigger the same event on all its parent elements.",
      },
    ],
    python: [
      {
        question: "What is a list comprehension?",
        answer: "A concise way to create lists in Python using a single line of code.",
      },
      {
        question: "What is a lambda function?",
        answer:
          "An anonymous function defined using the lambda keyword that can take any number of arguments but can only have one expression.",
      },
      {
        question: "What is the difference between a tuple and a list?",
        answer:
          "Tuples are immutable (can't be changed after creation) while lists are mutable. Tuples use parentheses () while lists use square brackets [].",
      },
      {
        question: "What is a decorator in Python?",
        answer:
          "A design pattern that allows behavior to be added to an individual object dynamically without affecting the behavior of other objects from the same class.",
      },
      {
        question: "What is the Global Interpreter Lock (GIL)?",
        answer:
          "A mutex that protects access to Python objects, preventing multiple threads from executing Python bytecode at once.",
      },
    ],
    "data-structures": [
      {
        question: "What is a stack?",
        answer: "A linear data structure that follows the Last In First Out (LIFO) principle.",
      },
      {
        question: "What is a queue?",
        answer: "A linear data structure that follows the First In First Out (FIFO) principle.",
      },
      {
        question: "What is a linked list?",
        answer:
          "A linear data structure where elements are stored in nodes, and each node points to the next node in the sequence.",
      },
      {
        question: "What is a binary search tree?",
        answer:
          "A tree data structure where each node has at most two children, and all nodes to the left of a parent are less than the parent, while all nodes to the right are greater.",
      },
      {
        question: "What is a hash table?",
        answer:
          "A data structure that implements an associative array abstract data type, a structure that can map keys to values using a hash function.",
      },
    ],
    "algorithms": [
      {
        question: "What is Big O notation?",
        answer:
          "A mathematical notation that describes the limiting behavior of a function when the argument tends towards a particular value or infinity.",
      },
      {
        question: "What is a recursive algorithm?",
        answer:
          "An algorithm that calls itself with smaller input values and returns the result for the current input by carrying out basic operations on the returned value for the smaller input.",
      },
      {
        question: "What is a greedy algorithm?",
        answer:
          "An algorithmic paradigm that follows the problem-solving heuristic of making the locally optimal choice at each stage.",
      },
      {
        question: "What is dynamic programming?",
        answer:
          "A method for solving complex problems by breaking them down into simpler subproblems and storing the results to avoid redundant calculations.",
      },
      {
        question: "What is a divide and conquer algorithm?",
        answer:
          "An algorithm design paradigm based on multi-branched recursion that works by breaking down a problem into two or more sub-problems.",
      },
    ],
    "machine-learning": [
      {
        question: "What is supervised learning?",
        answer:
          "A type of machine learning where the algorithm learns from labeled training data to make predictions or decisions.",
      },
      {
        question: "What is unsupervised learning?",
        answer: "A type of machine learning where the algorithm learns patterns from unlabeled data.",
      },
      {
        question: "What is a neural network?",
        answer:
          "A computational model inspired by the human brain that consists of layers of interconnected nodes or 'neurons'.",
      },
      {
        question: "What is overfitting?",
        answer:
          "When a model learns the training data too well, including its noise and outliers, resulting in poor performance on new, unseen data.",
      },
      {
        question: "What is gradient descent?",
        answer:
          "An optimization algorithm used to minimize a function by iteratively moving in the direction of steepest descent as defined by the negative of the gradient.",
      },
    ],
  }

  // Initialize
  function loadDeck(deckName) {
    currentDeck = deckName
    currentCardIndex = 0
    deckTitle.textContent = formatDeckName(deckName)
    loadCard()
  }

  function formatDeckName(name) {
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  function loadCard() {
    const deck = decks[currentDeck]
    if (!deck || deck.length === 0) {
      cardFront.innerHTML = "<p>No cards in this deck</p>"
      cardBack.innerHTML = "<p>Add cards to start studying</p>"
      cardCounter.textContent = "No cards"
      progress.style.width = "0%"
      return
    }

    const card = deck[currentCardIndex]
    cardFront.innerHTML = `<p>${card.question}</p>`
    cardBack.innerHTML = `<p>${card.answer}</p>`
    cardCounter.textContent = `Card ${currentCardIndex + 1} of ${deck.length}`
    progress.style.width = `${((currentCardIndex + 1) / deck.length) * 100}%`
  }

  // Event Handlers
  flashcard.addEventListener("click", () => {
    flashcard.classList.toggle("flipped")
  })

  nextBtn.addEventListener("click", () => {
    if (currentCardIndex < decks[currentDeck].length - 1) {
      currentCardIndex++
      flashcard.classList.remove("flipped")
      loadCard()
    }
  })

  prevBtn.addEventListener("click", () => {
    if (currentCardIndex > 0) {
      currentCardIndex--
      flashcard.classList.remove("flipped")
      loadCard()
    }
  })

  deckSelect.addEventListener("change", (event) => {
    loadDeck(event.target.value)
  })

  difficultyBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const difficulty = btn.getAttribute("data-difficulty")
      recordCardDifficulty(difficulty)

      // Move to next card if available
      if (currentCardIndex < decks[currentDeck].length - 1) {
        currentCardIndex++
        flashcard.classList.remove("flipped")
        loadCard()
      } else {
        // Show completion message or reset
        alert("You've completed this deck!")
        currentCardIndex = 0
        flashcard.classList.remove("flipped")
        loadCard()
      }
    })
  })

  function recordCardDifficulty(difficulty) {
    const timestamp = new Date().toISOString()
    studyHistory.push({
      deck: currentDeck,
      cardIndex: currentCardIndex,
      difficulty: difficulty,
      timestamp: timestamp,
    })

    // In a real app, you would save this to localStorage or send to a server
    console.log("Study history updated:", studyHistory)
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Spacebar") {
      // Space to flip card
      flashcard.classList.toggle("flipped")
    } else if (e.key === "ArrowRight" || e.key === "d") {
      // Right arrow or 'd' for next card
      nextBtn.click()
    } else if (e.key === "ArrowLeft" || e.key === "a") {
      // Left arrow or 'a' for previous card
      prevBtn.click()
    } else if (e.key === "1" || e.key === "h") {
      // 1 or 'h' for hard
      document.querySelector('[data-difficulty="hard"]').click()
    } else if (e.key === "2" || e.key === "g") {
      // 2 or 'g' for good
      document.querySelector('[data-difficulty="medium"]').click()
    } else if (e.key === "3" || e.key === "e") {
      // 3 or 'e' for easy
      document.querySelector('[data-difficulty="easy"]').click()
    }
  })

  // Initialize the first card
  loadDeck(currentDeck)
})

