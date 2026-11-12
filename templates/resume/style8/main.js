document.addEventListener('DOMContentLoaded', function() {
    // First try to load the data.json file directly
    fetch('data.json')
        .then(response => {
            if (!response.ok) throw new Error('File not found');
            return response.json();
        })
        .then(data => {
            // If successful, populate the resume
            populateResume(data);
        })
        .catch(error => {
            console.log('Could not load data.json directly, trying alternative methods:', error);
            // Fallback: Show file upload option
            showFileUploadOption();
        });
});

function showFileUploadOption() {
    const container = document.querySelector('main') || document.body;
    
    const uploadContainer = document.createElement('div');
    uploadContainer.className = 'file-upload-container';
    uploadContainer.style.textAlign = 'center';
    uploadContainer.style.padding = '2rem';
    uploadContainer.style.margin = '2rem auto';
    uploadContainer.style.maxWidth = '600px';
    
    uploadContainer.innerHTML = `
        <h2>Load Your Resume Data</h2>
        <p>To view your resume, please upload your <code>data.json</code> file:</p>
        <input type="file" id="jsonFileUpload" accept=".json" style="display: none;">
        <button id="uploadBtn" class="btn-primary">
            <i class="fas fa-upload"></i> Select JSON File
        </button>
        <p style="margin-top: 1rem; font-size: 0.9rem;">Don't have a file? <a href="form.html" style="color:red;">Create one first</a></p>
    `;
    
    container.prepend(uploadContainer);
    
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
                uploadContainer.style.display = 'none';
            } catch (error) {
                alert('Error parsing JSON file. Please check the file format.');
                console.error('Error parsing JSON:', error);
            }
        };
        reader.onerror = function() {
            alert('Error reading file. Please try again.');
        };
        reader.readAsText(file);
    });
}

function populateResume(data) {
    if (!data) return;
    
    // Set page title
    document.title = data.pageTitle || 'Resume';
    
    // Set logo text if available
    if (data.logoText) {
        document.getElementById('logo-text').textContent = data.logoText;
    }
    
    // Load navigation
    loadNavigation(data.navigation);
    
    // Load hero section
    loadHero(data.hero);
    
    // Load about section
    loadAbout(data.about);
    
    // Load experience
    loadExperience(data.experience);
    
    // Load education
    loadEducation(data.education);
    
    // Load skills
    loadSkills(data.skills);
    
    // Load languages
    loadLanguages(data.languages);
    
    // Load references
    loadReferences(data.references);
    
    // Load contact
    loadContact(data.contact);
    
    // Load footer
    loadFooter(data.footer);
    
    // Set up hamburger menu
    setupHamburgerMenu();
    
    // Set up smooth scrolling
    setupSmoothScrolling();
    
    // Set up download CV button if available
    if (data.downloadCvLink) {
        document.getElementById('download-cv').href = data.downloadCvLink;
    }
}

// All the existing load functions remain the same:
function loadNavigation(navItems) {
    const navList = document.getElementById('nav-list');
    
    if (!navItems || !navList) return;
    
    navItems.forEach(item => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = item.link;
        a.textContent = item.text;
        li.appendChild(a);
        navList.appendChild(li);
    });
}

function loadHero(heroData) {
    if (!heroData) return;
    
    if (heroData.title) {
        document.getElementById('hero-title').textContent = heroData.title;
    }
    
    if (heroData.subtitle) {
        document.getElementById('hero-subtitle').textContent = heroData.subtitle;
    }
    
    if (heroData.description) {
        document.getElementById('hero-description').textContent = heroData.description;
    }
    
    if (heroData.profilePhoto) {
        document.getElementById('profile-photo').src = heroData.profilePhoto;
        document.getElementById('profile-photo').alt = heroData.title || 'Profile Photo';
    }
}

function loadAbout(aboutData) {
    if (!aboutData) return;
    
    if (aboutData.text) {
        document.getElementById('about-text').textContent = aboutData.text;
    }
    
    if (aboutData.personalInfo && aboutData.personalInfo.length > 0) {
        const infoList = document.getElementById('personal-info');
        
        aboutData.personalInfo.forEach(info => {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = info.label + ':';
            li.appendChild(strong);
            li.appendChild(document.createTextNode(' ' + info.value));
            infoList.appendChild(li);
        });
    }
}

function loadExperience(experienceData) {
    if (!experienceData || !experienceData.length) return;
    
    const timeline = document.getElementById('experience-timeline');
    
    experienceData.forEach((exp, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        const content = document.createElement('div');
        content.className = 'timeline-content';
        
        if (exp.date) {
            const date = document.createElement('div');
            date.className = 'timeline-date';
            date.textContent = exp.date;
            content.appendChild(date);
        }
        
        if (exp.title) {
            const title = document.createElement('h3');
            title.className = 'timeline-title';
            title.textContent = exp.title;
            content.appendChild(title);
        }
        
        if (exp.company) {
            const company = document.createElement('div');
            company.className = 'timeline-subtitle';
            company.textContent = exp.company;
            content.appendChild(company);
        }
        
        if (exp.description) {
            const desc = document.createElement('p');
            desc.className = 'timeline-description';
            desc.textContent = exp.description;
            content.appendChild(desc);
        }
        
        item.appendChild(content);
        timeline.appendChild(item);
    });
}

function loadEducation(educationData) {
    if (!educationData || !educationData.length) return;
    
    const timeline = document.getElementById('education-timeline');
    
    educationData.forEach((edu, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        const content = document.createElement('div');
        content.className = 'timeline-content';
        
        if (edu.date) {
            const date = document.createElement('div');
            date.className = 'timeline-date';
            date.textContent = edu.date;
            content.appendChild(date);
        }
        
        if (edu.degree) {
            const degree = document.createElement('h3');
            degree.className = 'timeline-title';
            degree.textContent = edu.degree;
            content.appendChild(degree);
        }
        
        if (edu.institution) {
            const institution = document.createElement('div');
            institution.className = 'timeline-subtitle';
            institution.textContent = edu.institution;
            content.appendChild(institution);
        }
        
        if (edu.description) {
            const desc = document.createElement('p');
            desc.className = 'timeline-description';
            desc.textContent = edu.description;
            content.appendChild(desc);
        }
        
        item.appendChild(content);
        timeline.appendChild(item);
    });
}

function loadSkills(skillsData) {
    if (!skillsData || !skillsData.length) return;
    
    const container = document.getElementById('skills-container');
    
    skillsData.forEach(skill => {
        const item = document.createElement('div');
        item.className = 'skill-item';
        
        if (skill.icon) {
            const icon = document.createElement('div');
            icon.className = 'skill-icon';
            icon.innerHTML = `<i class="${skill.icon}"></i>`;
            item.appendChild(icon);
        }
        
        if (skill.name) {
            const name = document.createElement('h3');
            name.className = 'skill-name';
            name.textContent = skill.name;
            item.appendChild(name);
        }
        
        if (skill.level) {
            const levelContainer = document.createElement('div');
            levelContainer.className = 'skill-level';
            
            const levelBar = document.createElement('div');
            levelBar.className = 'skill-level-bar';
            levelBar.style.width = skill.level + '%';
            
            levelContainer.appendChild(levelBar);
            item.appendChild(levelContainer);
        }
        
        container.appendChild(item);
    });
}

function loadLanguages(languagesData) {
    if (!languagesData || !languagesData.length) return;
    
    const container = document.getElementById('languages-container');
    
    languagesData.forEach(lang => {
        const item = document.createElement('div');
        item.className = 'language-item';
        
        if (lang.name) {
            const name = document.createElement('h3');
            name.className = 'language-name';
            name.textContent = lang.name;
            item.appendChild(name);
        }
        
        if (lang.level) {
            const level = document.createElement('p');
            level.className = 'language-level';
            level.textContent = lang.level;
            item.appendChild(level);
        }
        
        container.appendChild(item);
    });
}

function loadReferences(referencesData) {
    if (!referencesData || !referencesData.length) return;
    
    const container = document.getElementById('references-container');
    
    referencesData.forEach(ref => {
        const item = document.createElement('div');
        item.className = 'reference-item';
        
        if (ref.photo) {
            const photo = document.createElement('img');
            photo.className = 'reference-photo';
            photo.src = ref.photo;
            photo.alt = ref.name || 'Reference';
            item.appendChild(photo);
        }
        
        if (ref.name) {
            const name = document.createElement('h3');
            name.className = 'reference-name';
            name.textContent = ref.name;
            item.appendChild(name);
        }
        
        if (ref.position) {
            const position = document.createElement('p');
            position.className = 'reference-position';
            position.textContent = ref.position;
            item.appendChild(position);
        }
        
        if (ref.text) {
            const text = document.createElement('p');
            text.className = 'reference-text';
            text.textContent = ref.text;
            item.appendChild(text);
        }
        
        if (ref.contact) {
            const contact = document.createElement('p');
            contact.className = 'reference-contact';
            contact.textContent = ref.contact;
            item.appendChild(contact);
        }
        
        container.appendChild(item);
    });
}

function loadContact(contactData) {
    if (!contactData) return;
    
    const container = document.getElementById('contact-info');
    
    if (contactData.items && contactData.items.length > 0) {
        contactData.items.forEach(item => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            
            const icon = document.createElement('div');
            icon.className = 'contact-icon';
            icon.innerHTML = `<i class="${item.icon}"></i>`;
            contactItem.appendChild(icon);
            
            const text = document.createElement('div');
            text.className = 'contact-text';
            
            if (item.link) {
                const a = document.createElement('a');
                a.href = item.link;
                a.textContent = item.text;
                text.appendChild(a);
            } else {
                text.textContent = item.text;
            }
            
            contactItem.appendChild(text);
            container.appendChild(contactItem);
        });
    }
    
    if (contactData.mapEmbedUrl) {
        const iframe = document.getElementById('map-iframe');
        iframe.src = contactData.mapEmbedUrl;
    }
}

function loadFooter(footerData) {
    if (!footerData) return;
    
    const container = document.getElementById('footer-content');
    
    if (footerData.socialLinks && footerData.socialLinks.length > 0) {
        const socialLinks = document.createElement('div');
        socialLinks.className = 'social-links';
        
        footerData.socialLinks.forEach(link => {
            const a = document.createElement('a');
            a.className = 'social-link';
            a.href = link.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.innerHTML = `<i class="${link.icon}"></i>`;
            socialLinks.appendChild(a);
        });
        
        container.appendChild(socialLinks);
    }
    
    if (footerData.copyright) {
        const copyright = document.createElement('div');
        copyright.className = 'copyright';
        copyright.textContent = footerData.copyright;
        container.appendChild(copyright);
    }
}

function setupHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navList = document.getElementById('nav-list');
    
    if (hamburger && navList) {
        hamburger.addEventListener('click', () => {
            navList.classList.toggle('active');
            hamburger.innerHTML = navList.classList.contains('active') ? 
                '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
        });
        
        // Close menu when clicking on a link
        const navLinks = navList.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navList.classList.remove('active');
                hamburger.innerHTML = '<i class="fas fa-bars"></i>';
            });
        });
    }
}

function setupSmoothScrolling() {
    // Smooth scrolling for all links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
}