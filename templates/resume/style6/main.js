document.addEventListener('DOMContentLoaded', () => {
  // Create file input element
  const createFileInput = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'json-upload';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    return fileInput;
  };

  // Render resume data
  const renderResume = (data) => {
    // Update page title, site title, and footer name
    const userName = data.name || 'Resume';
    document.title = userName;
    document.getElementById('site-title').textContent = userName;
    document.getElementById('footer-name').textContent = userName;
    document.getElementById('user-name').textContent = userName;

    // Update profile section on hero card
    document.getElementById('user-title').textContent = data.title || 'N/A';

    // Update About Me section
    document.getElementById('about-me-text').textContent = data.aboutMe || 'No description provided.';

    // Update Education section
    const educationItems = document.getElementById('education-items');
    educationItems.innerHTML = ''; // Clear existing items
    (data.education || []).forEach((edu, index) => {
      const div = document.createElement('div');
      div.classList.add('education-item');
      div.innerHTML = `
        <p class="text-sm text-gray-500">(${edu.years || 'Unknown Years'})</p>
        <h3>${edu.degree || 'Unknown Degree'}</h3>
        <p>${edu.university || 'Unknown University'}</p>
        <p>${edu.grade || 'N/A'}</p>
        <div class="timeline-dot"></div>
        ${index < data.education.length - 1 ? '<div class="timeline-line"></div>' : ''}
      `;
      educationItems.appendChild(div);
    });

    // Update Experience section
    const experienceItems = document.getElementById('experience-items');
    experienceItems.innerHTML = ''; // Clear existing items
    (data.experience || []).forEach((exp, index) => {
      const div = document.createElement('div');
      div.classList.add('experience-item');
      const responsibilitiesHtml = (exp.responsibilities || []).map(resp => `<li>${resp}</li>`).join('');
      div.innerHTML = `
        <p class="text-sm text-gray-500">(${exp.years || 'Unknown Years'})</p>
        <h3>${exp.title || 'Unknown Title'}</h3>
        <p>${exp.company || 'Unknown Company'}</p>
        <ul>${responsibilitiesHtml || '<li>No responsibilities listed.</li>'}</ul>
        <div class="timeline-dot"></div>
        ${index < data.experience.length - 1 ? '<div class="timeline-line"></div>' : ''}
      `;
      experienceItems.appendChild(div);
    });

    // Update Skills section
    const skillsList = document.getElementById('skills-list');
    skillsList.innerHTML = ''; // Clear existing items
    (data.skills || []).forEach(skill => {
      const li = document.createElement('li');
      li.textContent = skill || 'Unknown Skill';
      skillsList.appendChild(li);
    });

    // Update Language section
    const languageList = document.getElementById('language-list');
    languageList.innerHTML = ''; // Clear existing items
    (data.languages || []).forEach(language => {
      const li = document.createElement('li');
      li.textContent = language || 'Unknown Language';
      languageList.appendChild(li);
    });

    // Update Contact section
    const contact = data.contact || {};
    document.getElementById('contact-phone').textContent = contact.phone || 'N/A';
    document.getElementById('contact-email').textContent = contact.email || 'N/A';
    document.getElementById('contact-address').textContent = contact.address || 'N/A';

    // Update Social Links in contact section
    const contactList = document.querySelector('.contact-info-list');
    // Remove existing social links to prevent duplicates
    contactList.querySelectorAll('.social-link').forEach(el => el.remove());
    if (data.social_links && data.social_links.length > 0) {
      data.social_links.forEach(link => {
        const li = document.createElement('li');
        li.classList.add('social-link');
        li.innerHTML = `
          <a href="${link.url || '#'}" target="_blank" title="${link.platform || 'Social Link'}">
            <i class="${link.icon || 'fas fa-globe'} contact-icon"></i>
            ${link.platform || 'Social'}
          </a>
        `;
        contactList.appendChild(li);
      });
    }

    // Update footer copyright
    const currentYear = document.getElementById('current-year');
    if (currentYear) {
      currentYear.textContent = new Date().getFullYear();
    }
  };

  // Try to load data.json automatically
  fetch('data.json')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch data.json');
      return res.json();
    })
    .then(data => {
      renderResume(data);
    })
    .catch(err => {
      console.log('Falling back to local file selection:', err);

      // Create and show file input prompt
      const fileInput = createFileInput();
      const uploadLabel = document.createElement('div');
      uploadLabel.className = 'file-upload-prompt';
      uploadLabel.innerHTML = `
        <div class="text-center mt-4">
          <p class="text-sm font-medium text-gray-500 mb-2">Please select your portfolio data file (data.json):</p>
          <button class="upload-button bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Select File</button>
        </div>
      `;
      document.body.insertBefore(uploadLabel, document.body.firstChild);

      uploadLabel.querySelector('button').addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
          alert('Please select a data.json file.');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            uploadLabel.style.display = 'none'; // Hide prompt after successful load
            renderResume(data);
          } catch (parseError) {
            alert('Error parsing JSON file. Please check the file format.');
            console.error(parseError);
          }
        };
        reader.onerror = () => {
          alert('Error reading file. Please try again.');
          console.error('Error reading file');
        };
        reader.readAsText(file);
      });
    });

  // Hamburger menu functionality
  const mobileMenu = document.getElementById('mobile-menu');
  const navList = document.getElementById('nav-list');

  if (mobileMenu && navList) {
    mobileMenu.addEventListener('click', () => {
      navList.classList.toggle('active');
    });

    // Close mobile menu when a link is clicked
    navList.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navList.classList.remove('active');
      });
    });
  }
});