document.addEventListener("DOMContentLoaded", () => {
    // Handle flash message close buttons
    const closeButtons = document.querySelectorAll(".close-flash")
  
    closeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        const flashMessage = this.parentElement
        flashMessage.style.animation = "fadeOut 0.3s ease forwards"
  
        setTimeout(() => {
          flashMessage.remove()
        }, 300)
      })
    })
  
    // Auto-hide flash messages after 5 seconds
    const flashMessages = document.querySelectorAll(".flash-message")
  
    flashMessages.forEach((message) => {
      setTimeout(() => {
        message.style.animation = "fadeOut 0.3s ease forwards"
  
        setTimeout(() => {
          message.remove()
        }, 300)
      }, 5000)
    })
  })
  