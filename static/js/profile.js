// static/js/profile.js
document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements - Get references to all interactive elements
    const profileForm = document.getElementById("profileForm");
    const saveChangesBtn = document.getElementById("saveChanges");
    const changeAvatarBtn = document.getElementById("changeAvatar");
    const avatarInput = document.getElementById("avatarInput");
    const avatarImg = document.getElementById("avatarImg");
    const deleteAccountBtn = document.getElementById("deleteAccount");

    // Profile Info Fields (Editable)
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const timezoneSelect = document.getElementById('timezone'); // Assuming this exists

    // Profile Info Display Elements (Non-editable, usually updated after save)
    const profileNameDisplay = document.getElementById('profileName');
    const profileEmailDisplay = document.getElementById('profileEmail');

    // SRA Settings Inputs (Editable) - Ensure these IDs match your HTML
    const newCardsPerDayInput = document.getElementById('new-cards-per-day');
    const maxReviewsPerDayInput = document.getElementById('max-reviews-per-day');
    const learningStepsInput = document.getElementById('learning-steps');
    const easeBonusInput = document.getElementById('ease-bonus');

    // --- Fetch Profile Data ---
    async function fetchProfile() {
        try {
            if (saveChangesBtn) {
                 saveChangesBtn.disabled = true;
                 saveChangesBtn.textContent = 'Loading...';
            }

            const response = await fetch('/api/profile');
            if (!response.ok) {
                 if (response.status === 401) { window.location.href = '/auth?tab=login&next=' + encodeURIComponent(window.location.pathname); return; }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success && result.profile) {
                const profile = result.profile;

                if (nameInput) nameInput.value = profile.username || '';
                if (emailInput) emailInput.value = profile.email || '';
                if (timezoneSelect && profile.timezone !== undefined) {
                    timezoneSelect.value = profile.timezone;
                }

                if (profileNameDisplay) profileNameDisplay.textContent = profile.username || 'N/A';
                if (profileEmailDisplay) profileEmailDisplay.textContent = profile.email || 'N/A';

                if (profile.settings) {
                    if (newCardsPerDayInput) newCardsPerDayInput.value = profile.settings.new_cards_per_day !== undefined ? profile.settings.new_cards_per_day : '';
                    if (maxReviewsPerDayInput) maxReviewsPerDayInput.value = profile.settings.max_reviews_per_day !== undefined ? profile.settings.max_reviews_per_day : '';
                    if (learningStepsInput) learningStepsInput.value = profile.settings.learning_steps !== undefined ? profile.settings.learning_steps : '';
                    if (easeBonusInput) easeBonusInput.value = profile.settings.ease_bonus !== undefined ? profile.settings.ease_bonus : '';
                }

            } else {
                alert(`Error loading profile: ${result.errors?.general || 'Unknown error'}`);
                 if (profileForm) profileForm.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
                 if (saveChangesBtn) saveChangesBtn.textContent = 'Load Error';
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
            alert(`An unexpected error occurred while loading profile: ${error.message}`);
            if (profileForm) profileForm.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = true);
            if (saveChangesBtn) saveChangesBtn.textContent = 'Load Error';

        } finally {
             if (saveChangesBtn) {
                saveChangesBtn.disabled = false;
                // Only restore text if it's still showing 'Loading...'
                 if (saveChangesBtn.textContent === 'Loading...') {
                    saveChangesBtn.textContent = 'Save Changes';
                 }
             }
        }
    }

    // --- Save Profile Changes ---
    async function saveProfile() {
        // Declare originalButtonText here, outside the try block
        let originalButtonText = 'Save Changes'; // Default value

        if (!saveChangesBtn) {
            console.error("Save Changes button not found.");
            return; // Cannot proceed if button doesn't exist
        }

        const profileData = {
            username: nameInput ? nameInput.value.trim() : undefined,
            email: emailInput ? emailInput.value.trim() : undefined,
            timezone: timezoneSelect ? timezoneSelect.value : undefined,
            settings: {}
        };

        if (newCardsPerDayInput) profileData.settings.new_cards_per_day = newCardsPerDayInput.value;
        if (maxReviewsPerDayInput) profileData.settings.max_reviews_per_day = maxReviewsPerDayInput.value;
        if (learningStepsInput) profileData.settings.learning_steps = learningStepsInput.value;
        if (easeBonusInput) profileData.settings.ease_bonus = easeBonusInput.value;


        if (nameInput && !profileData.username) {
             alert("Username cannot be empty.");
             nameInput.focus();
             return;
        }
         if (emailInput && !profileData.email) {
             alert("Email cannot be empty.");
             emailInput.focus();
             return;
        }

        if (newCardsPerDayInput && (isNaN(parseInt(profileData.settings.new_cards_per_day)) || parseInt(profileData.settings.new_cards_per_day) < 1)) {
             alert("New Cards Per Day must be a positive number.");
             newCardsPerDayInput.focus();
             return;
        }
         if (maxReviewsPerDayInput && (isNaN(parseInt(profileData.settings.max_reviews_per_day)) || parseInt(profileData.settings.max_reviews_per_day) < 1)) {
             alert("Maximum Reviews Per Day must be a positive number.");
             maxReviewsPerDayInput.focus();
             return;
        }
         if (easeBonusInput && (isNaN(parseFloat(profileData.settings.ease_bonus)) || parseFloat(profileData.settings.ease_bonus) < 1.0)) {
             alert("Starting Ease Bonus must be a number 1.0 or greater.");
             easeBonusInput.focus();
             return;
        }


        try {
            saveChangesBtn.disabled = true;
            originalButtonText = saveChangesBtn.textContent; // Assign value here
            saveChangesBtn.innerHTML = '<span class="btn-loader"></span> Saving...';


            const response = await fetch('/api/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(profileData),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert(result.message || 'Profile updated successfully!');
               if (result.profile) {
                    if (profileNameDisplay) profileNameDisplay.textContent = result.profile.username || 'N/A';
                    if (profileEmailDisplay) profileEmailDisplay.textContent = result.profile.email || 'N/A';
                    // Re-populate inputs with values from backend response (cleaned/validated)
                     if (nameInput) nameInput.value = result.profile.username || '';
                     if (emailInput) emailInput.value = result.profile.email || '';
                     if (timezoneSelect && result.profile.timezone !== undefined) {
                         timezoneSelect.value = result.profile.timezone;
                     }
                     if (result.profile.settings) {
                         if (newCardsPerDayInput) newCardsPerDayInput.value = result.profile.settings.new_cards_per_day !== undefined ? result.profile.settings.new_cards_per_day : '';
                         if (maxReviewsPerDayInput) maxReviewsPerDayInput.value = result.profile.settings.max_reviews_per_day !== undefined ? result.profile.settings.max_reviews_per_day : '';
                         if (learningStepsInput) learningStepsInput.value = result.profile.settings.learning_steps !== undefined ? result.profile.settings.learning_steps : '';
                         if (easeBonusInput) easeBonusInput.value = result.profile.settings.ease_bonus !== undefined ? result.profile.settings.ease_bonus : '';
                     }
               }

            } else {
               const errorMsg = result.errors ? (result.errors.general || Object.values(result.errors).join(", ")) : (result.message || 'Failed to update profile.');
              alert(`Error updating profile: ${errorMsg}`);
            }
        } catch (error) {
            console.error("Failed to save profile:", error);
            alert(`An unexpected error occurred while saving profile: ${error.message}`);
        } finally {
            // This is where the ReferenceError occurred. originalButtonText is now in scope.
            saveChangesBtn.disabled = false;
            saveChangesBtn.textContent = originalButtonText; // Restore original text
        }
    }

    // --- Event Listeners ---
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener("click", (e) => {
            e.preventDefault();
            saveProfile();
        });
    }

    // Handle Change Avatar button click and local preview
   if (changeAvatarBtn && avatarInput && avatarImg) {
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
   } else {
        if (changeAvatarBtn) changeAvatarBtn.style.display = 'none';
   }

  // Handle Delete Account button click
  if (deleteAccountBtn) {
       deleteAccountBtn.addEventListener("click", () => {
           if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
               alert("Account deletion functionality not yet implemented.");
           }
       });
   }

    // --- Initial Load ---
    if (nameInput && emailInput && profileNameDisplay && profileEmailDisplay) {
         fetchProfile();
    } else {
        console.error("Required profile elements not found in HTML.");
        if (saveChangesBtn) {
             saveChangesBtn.disabled = true;
             saveChangesBtn.textContent = 'Error: Missing Elements';
        }
    }
});