document.addEventListener('DOMContentLoaded', function() {
    // Set current year in footer
    document.getElementById('currentYear').textContent = new Date().getFullYear();

    // Mobile menu toggle
    const hamburger = document.querySelector('.hamburger');
    const mobileNav = document.querySelector('.mobile-nav');
    
    if (hamburger && mobileNav) {
        hamburger.addEventListener('click', () => {
            mobileNav.classList.toggle('active');
        });

        // Close mobile menu when clicking a link
        document.querySelectorAll('.mobile-nav a').forEach(link => {
            link.addEventListener('click', () => {
                mobileNav.classList.remove('active');
            });
        });
    }

    // Load resume data with fallback for local file access
    loadResumeData();

    // Smooth scrolling for navigation
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });
});

async function loadResumeData() {
    try {
        // First try to fetch the data.json file
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('File not found');
        
        const data = await response.json();
        populateResume(data);
        setupEditModal(data);
        setupNavigationHighlight();
    } catch (error) {
        console.log('Could not load data.json directly, trying alternative methods:', error);
        
        // Fallback 1: Check if data is in URL hash
        if (window.location.hash && window.location.hash.startsWith('#data=')) {
            try {
                const jsonData = decodeURIComponent(window.location.hash.substring(6));
                const data = JSON.parse(jsonData);
                populateResume(data);
                setupEditModal(data);
                setupNavigationHighlight();
                return;
            } catch (e) {
                console.error('Error parsing data from URL:', e);
            }
        }
        
        // Fallback 2: Show file upload option
        showFileUploadOption();
    }
}

function showFileUploadOption() {
    const mainContent = document.querySelector('main') || document.body;
    
    const uploadContainer = document.createElement('div');
    uploadContainer.className = 'file-upload-container';
    uploadContainer.style.textAlign = 'center';
    uploadContainer.style.padding = '2rem';
    uploadContainer.style.backgroundColor = '#f5f5f5';
    uploadContainer.style.borderRadius = '8px';
    uploadContainer.style.margin = '2rem auto';
    uploadContainer.style.maxWidth = '600px';
    
    uploadContainer.innerHTML = `
        <h2>Load Your Resume Data</h2>
        <p>To view your resume, please upload your <code>data.json</code> file:</p>
        <input type="file" id="jsonFileUpload" accept=".json" style="display: none;">
        <button id="uploadBtn" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Select JSON File
        </button>
        <p style="margin-top: 1rem; font-size: 0.9rem;">Don't have a file? <a href="form.html">Create one first</a></p>
    `;
    
    mainContent.prepend(uploadContainer);
    
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('jsonFileUpload');
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                populateResume(data);
                setupEditModal(data);
                setupNavigationHighlight();
                uploadContainer.style.display = 'none';
            } catch (error) {
                alert('Error parsing JSON file. Please check the file format.');
                console.error('Error parsing JSON:', error);
            }
        };
        reader.readAsText(file);
    });
}

function populateResume(data) {
    // Personal Info
    document.getElementById('fullName').textContent = `${data.personalInfo.firstName} ${data.personalInfo.lastName}`;
    document.getElementById('jobTitle').textContent = data.personalInfo.jobTitle;
    document.getElementById('footerName').textContent = `${data.personalInfo.firstName} ${data.personalInfo.lastName}`;
    document.getElementById('email').innerHTML = `<i class="fas fa-envelope"></i> ${data.personalInfo.email}`;
    document.getElementById('phone').innerHTML = `<i class="fas fa-phone"></i> ${data.personalInfo.phone}`;
    document.getElementById('location').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${data.personalInfo.location}`;
    
    // About
    document.getElementById('aboutText').textContent = data.about;
    
    // Skills
    const skillsList = document.getElementById('skillsList');
    data.skills.forEach(skill => {
        const li = document.createElement('li');
        li.className = 'skill-item';
        li.innerHTML = `
            <span class="skill-name">${skill.name}</span>
            <div class="skill-bar">
                <div class="skill-progress" style="width: ${skill.level}%"></div>
            </div>
        `;
        skillsList.appendChild(li);
    });
    
    // Experience
    const experienceList = document.getElementById('experienceList');
    data.experience.forEach(exp => {
        const div = document.createElement('div');
        div.className = 'experience-item';
        div.innerHTML = `
            <h4 class="experience-title">${exp.position}</h4>
            <p class="experience-company">${exp.company}</p>
            <p class="experience-dates">${exp.startDate} - ${exp.endDate}</p>
            <p class="experience-description">${exp.description}</p>
            <ul class="experience-details">
                ${exp.details.map(detail => `<li>${detail}</li>`).join('')}
            </ul>
        `;
        experienceList.appendChild(div);
    });
    
    // Education
    const educationList = document.getElementById('educationList');
    data.education.forEach(edu => {
        const div = document.createElement('div');
        div.className = 'education-item';
        div.innerHTML = `
            <p class="education-degree">${edu.degree}</p>
            <p class="education-school">${edu.institution}</p>
            ${edu.location ? `<p class="education-location">${edu.location}</p>` : ''}
            <p class="education-dates">${edu.year}</p>
        `;
        educationList.appendChild(div);
    });
    
    // Languages
    const languagesList = document.getElementById('languagesList');
    data.languages.forEach(lang => {
        const li = document.createElement('li');
        li.className = 'language-item';
        li.innerHTML = `
            <span>${lang.name}</span>
            <span>${lang.level}%</span>
        `;
        languagesList.appendChild(li);
    });
    
    // Projects
    const projectsList = document.getElementById('projectsList');
    data.projects.forEach(project => {
        const div = document.createElement('div');
        div.className = 'project-card';
        div.innerHTML = `
            <h4 class="project-title">${project.name}</h4>
            <p class="project-description">${project.description}</p>
            <div class="project-links">
                ${project.liveUrl ? `<a href="${project.liveUrl}" target="_blank"><i class="fas fa-external-link-alt"></i> Live Demo</a>` : ''}
                ${project.codeUrl ? `<a href="${project.codeUrl}" target="_blank"><i class="fab fa-github"></i> View Code</a>` : ''}
            </div>
        `;
        projectsList.appendChild(div);
    });
    
    // Social Links
    const socialLinks = document.getElementById('socialLinks');
    data.socialLinks.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url;
        a.target = '_blank';
        a.innerHTML = `<i class="fab fa-${link.name.toLowerCase()}"></i>`;
        socialLinks.appendChild(a);
    });
}

function setupEditModal(data) {
    const editImageBtn = document.getElementById('editImageBtn');
    const editModal = document.getElementById('editModal');
    const editFieldSelect = document.getElementById('editField');
    const editForm = document.getElementById('editForm');
    
    // Populate edit field options
    const fields = [
        { id: 'firstName', label: 'First Name', value: data.personalInfo.firstName },
        { id: 'lastName', label: 'Last Name', value: data.personalInfo.lastName },
        { id: 'jobTitle', label: 'Job Title', value: data.personalInfo.jobTitle },
        { id: 'email', label: 'Email', value: data.personalInfo.email },
        { id: 'phone', label: 'Phone', value: data.personalInfo.phone },
        { id: 'location', label: 'Location', value: data.personalInfo.location },
        { id: 'about', label: 'About Me', value: data.about }
    ];
    
    fields.forEach(field => {
        const option = document.createElement('option');
        option.value = field.id;
        option.textContent = field.label;
        editFieldSelect.appendChild(option);
    });
    
    // Handle field selection change
    editFieldSelect.addEventListener('change', () => {
        const selectedField = editFieldSelect.value;
        const field = fields.find(f => f.id === selectedField);
        document.getElementById('editValue').value = field ? field.value : '';
    });
    
    // Handle edit image button
    editImageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        alert('In a real implementation, this would allow you to upload a new profile image.');
    });
    
    // Handle form submission
    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fieldId = editFieldSelect.value;
        const newValue = document.getElementById('editValue').value;
        
        // In a real implementation, you would save this to the JSON file or database
        alert(`Field "${fieldId}" would be updated to: ${newValue}`);
        editModal.style.display = 'none';
    });
    
    // Modal functionality
    const closeBtn = document.querySelector('.close-btn');
    
    closeBtn.addEventListener('click', () => {
        editModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === editModal) {
            editModal.style.display = 'none';
        }
    });
}

function setupNavigationHighlight() {
    const sections = document.querySelectorAll('.main-section, .sidebar-section');
    const navLinks = document.querySelectorAll('.desktop-nav a, .mobile-nav a');
    
    window.addEventListener('scroll', () => {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (pageYOffset >= (sectionTop - 150)) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}