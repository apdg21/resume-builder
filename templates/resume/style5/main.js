document.addEventListener('DOMContentLoaded', () => {
  // Hamburger menu toggle
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
      });
    });
  }

  // Highlight active nav link on scroll
  const sections = document.querySelectorAll('main > section');
  window.addEventListener('scroll', () => {
    let scrollPos = window.scrollY + 80;
    sections.forEach(sec => {
      const id = sec.getAttribute('id');
      if (
        sec.offsetTop <= scrollPos &&
        sec.offsetTop + sec.offsetHeight > scrollPos
      ) {
        document
          .querySelectorAll('.nav-links a')
          .forEach(a => a.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-links a[href="#${id}"]`);
        if (activeLink) activeLink.classList.add('active');
      }
    });
  });

  // Create file input element for local loading
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
  const renderResumeData = (data) => {
    // Validate socials data
    if (!data.footer?.socials) {
      console.warn('No socials data found in data.json');
    } else {
      console.log('Socials data:', data.footer.socials);
    }

    // Update page title dynamically
    document.title = `${data.name} – Resume`;

    // Navbar brand (title)
    const navBrand = document.getElementById('nav-brand');
    if (navBrand) {
      navBrand.textContent = data.name;
    }

    // Header content
    const nameElement = document.getElementById('name');
    const jobTitleElement = document.getElementById('job-title');
    if (nameElement) nameElement.textContent = data.name;
    if (jobTitleElement) jobTitleElement.textContent = data.title;

    // About
    const aboutText = document.getElementById('about-text');
    if (aboutText) aboutText.textContent = data.about;

    // Experience
    const expList = document.getElementById('experience-list');
    if (expList) {
      expList.innerHTML = data.experience.map(exp => `
        <div class="experience-item">
          <div class="dates">${exp.start} – ${exp.end}</div>
          <div class="company">${exp.company}</div>
          <div class="role">${exp.role}</div>
          <ul>
            ${exp.details.map(d => `<li>${d}</li>`).join('')}
          </ul>
        </div>
      `).join('');
    }

    // Education
    const eduList = document.getElementById('education-list');
    if (eduList) {
      eduList.innerHTML = data.education.map(edu => `
        <div class="education-item">
          <div class="dates">${edu.start} – ${edu.end}</div>
          <div class="institution">${edu.institution}</div>
          <div class="degree">${edu.degree}</div>
        </div>
      `).join('');
    }

    // Skills
    const skillsList = document.getElementById('skills-list');
    if (skillsList) {
      skillsList.innerHTML = data.skills.map(skill => `<li>${skill}</li>`).join('');
    }

    // Languages
    const languagesList = document.getElementById('languages-list');
    if (languagesList) {
      languagesList.innerHTML = data.languages.map(lang => `<li>${lang}</li>`).join('');
    }

    // References
    const refList = document.getElementById('references-list');
    if (refList) {
      refList.innerHTML = data.references.map(ref => `
        <div class="reference-item">
          <div class="name">${ref.name}</div>
          <div class="role">${ref.role}</div>
          <div class="contact">
            <strong>Phone:</strong> ${ref.phone}<br>
            <strong>Email:</strong> <a href="mailto:${ref.email}" style="color:#6d7a8a">${ref.email}</a>
          </div>
        </div>
      `).join('');
    }

    // Contact
    const contactList = document.getElementById('contact-list');
    if (contactList) {
      contactList.innerHTML = `
        <li><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.72 19.72 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13 1.05.35 2.07.68 3.06a2 2 0 0 1-.45 2.11L8.09 10.91a16 16 0 0 0 6 6l1.02-1.02a2 2 0 0 1 2.11-.45c.99.33 2.01.55 3.06.68A2 2 0 0 1 22 16.92z"/></svg>${data.contact.phone}</li>
        <li><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/></svg><a href="mailto:${data.contact.email}" style="color:#6d7a8a">${data.contact.email}</a></li>
        <li><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.657 16.657L13.414 12.414A8 8 0 1 0 12 20h.01"/></svg>${data.contact.address}</li>
      `;
    }

    // Footer text
    const footerCopy = document.getElementById('footer-copy');
    if (footerCopy) {
      footerCopy.textContent = data.footer?.text || '';
    }

    // Footer socials with Font Awesome icons
    const footerSocials = document.getElementById('footer-socials');
    if (footerSocials && data.footer?.socials) {
      footerSocials.innerHTML = '';
      const iconMap = {
        'linkedin': 'fa-linkedin',
        'twitter': 'fa-x-twitter',
        'facebook': 'fa-facebook'
      };
      data.footer.socials.forEach(social => {
        const platform = social.name.toLowerCase();
        const iconClass = iconMap[platform] || 'fa-globe';
        const a = document.createElement('a');
        a.href = social.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', social.name);
        const i = document.createElement('i');
        i.className = `fab ${iconClass}`;
        a.appendChild(i);
        footerSocials.appendChild(a);
      });
    }
  };

  // Try to load data.json automatically
  fetch('data.json')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch data.json');
      return res.json();
    })
    .then(data => {
      renderResumeData(data);
    })
    .catch(err => {
      console.log('Falling back to local file selection:', err);

      // Create and show file input prompt
      const fileInput = createFileInput();
      const uploadLabel = document.createElement('div');
      uploadLabel.className = 'file-upload-prompt';
      uploadLabel.innerHTML = `
        <div class="upload-container">
          <p>Please select your resume data file (data.json):</p>
          <button class="upload-button">Select File</button>
          <p style="margin-top: 1rem; font-size: 0.9rem;">Don't have a file? <a href="form.html">Create one first</a></p>
        </div>
      `;
      
      uploadLabel.querySelector('button').addEventListener('click', () => fileInput.click());
      document.body.insertBefore(uploadLabel, document.body.firstChild);

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            uploadLabel.style.display = 'none';
            fileInput.remove();
            renderResumeData(data);
          } catch (parseError) {
            alert('Error parsing JSON file. Please check the file format.');
            console.error(parseError);
          }
        };
        reader.onerror = () => {
          alert('Error reading file');
        };
        reader.readAsText(file);
      });
    });
});