document.addEventListener("DOMContentLoaded", () => {
  const profileForm = document.getElementById("profileForm");
  const saveChangesBtn = document.getElementById("saveChanges");
  const changeAvatarBtn = document.getElementById("changeAvatar");
  const avatarInput = document.getElementById("avatarInput");
  const avatarImg = document.getElementById("avatarImg");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const emailNotificationsToggle = document.getElementById(
    "emailNotificationsToggle"
  );
  const deleteAccountBtn = document.getElementById("deleteAccount");

  saveChangesBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Here you would typically send the form data to your backend
    alert("Profile changes saved!");
  });

  changeAvatarBtn.addEventListener("click", () => {
    avatarInput.click();
  });

  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarImg.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  darkModeToggle.addEventListener("change", () => {
    document.body.classList.toggle("dark-mode");
    // Here you would typically save this preference to your backend
  });

  emailNotificationsToggle.addEventListener("change", () => {
    // Here you would typically save this preference to your backend
  });

  deleteAccountBtn.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to delete your account? This action cannot be undone."
      )
    ) {
      // Here you would typically send a request to your backend to delete the account
      alert("Account deleted. Redirecting to homepage...");
      // Redirect to homepage or login page
    }
  });
});
