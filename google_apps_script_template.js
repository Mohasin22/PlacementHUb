/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         PlacementHub — Google Forms Integration          ║
 * ║         Auto-forward submissions to PlacementHub API     ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * SETUP INSTRUCTIONS:
 * ─────────────────────────────────────────────────────────────
 * 1. Open your Google Form
 * 2. Click the 3-dot menu (⋮) → Script editor
 * 3. Paste this entire file, replacing any existing content
 * 4. Update INSTITUTION_ID and API_URL with your values
 * 5. Click Save (💾)
 * 6. Set up the trigger:
 *    → Triggers (⏰ icon) → Add Trigger
 *    → Function: onFormSubmit
 *    → Event source: From form
 *    → Event type: On form submit
 *    → Click Save
 * 7. Grant permission when prompted
 *
 * GOOGLE FORM QUESTION TITLES:
 * ─────────────────────────────────────────────────────────────
 * Your form questions must be titled exactly as listed below
 * (matching is case-insensitive). Required fields are marked *.
 *
 * * Full Name
 * * Roll Number
 * * Date of Birth                  (format: YYYY-MM-DD)
 * * Gender                         (Male / Female / Other)
 * * Mobile Number
 * * Personal Email
 * * Institute Email
 * * Program Name                   (e.g. B.Tech, MBA)
 * * Department Name                (e.g. Computer Engineering)
 * * Class Name                     (e.g. CS-A, MBA-1)
 * * Current CGPA
 * * Active Backlogs
 * * Total Backlogs
 *   10th Board                     (e.g. CBSE, State Board)
 *   10th Marks / Percentage
 *   12th Board
 *   12th Marks / Percentage
 *   Skills                         (comma-separated list)
 *   Projects                       (comma-separated list)
 *   Resume Drive Link
 *   Passport Photo Link
 */

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
const INSTITUTION_ID = 'YOUR_INSTITUTION_ID_HERE'; // From PlacementHub onboarding page
const API_URL        = 'https://your-domain.com/api'; // Your deployed PlacementHub API base URL
// ─────────────────────────────────────────────────────────────────────────────


function onFormSubmit(e) {
  try {
    const response      = e.response;
    const itemResponses = response.getItemResponses();

    // Build a lowercase-key map for easy lookup
    const fields = {};
    itemResponses.forEach(item => {
      const key = item.getItem().getTitle().toLowerCase().trim().replace(/\s+/g, ' ');
      fields[key] = item.getResponse();
    });

    // ── Map form fields to API payload ──────────────────────────────────────
    const payload = {
      name:               get(fields, ['full name', 'name', 'student name', 'student full name']),
      roll_number:        get(fields, ['roll number', 'roll no', 'enrollment number', 'enrolment number']),
      dob:                get(fields, ['date of birth', 'dob', 'birth date', 'date of birth (yyyy-mm-dd)']),
      gender:             get(fields, ['gender', 'sex']),
      mobile:             get(fields, ['mobile number', 'mobile', 'phone', 'contact number']),
      personal_email:     get(fields, ['personal email', 'personal email address', 'gmail']),
      institute_email:    get(fields, ['institute email', 'college email', 'official email', 'university email']),
      program_name:       get(fields, ['program name', 'program', 'course', 'degree']),
      department_name:    get(fields, ['department name', 'department', 'branch']),
      class_name:         get(fields, ['class name', 'class', 'section', 'division']),
      cgpa:               parseFloat(get(fields, ['current cgpa', 'cgpa', 'gpa', 'aggregate cgpa']) || '0'),
      active_backlogs:    parseInt(get(fields, ['active backlogs', 'live backlogs', 'current backlogs']) || '0', 10),
      total_backlogs:     parseInt(get(fields, ['total backlogs', 'total backlogs (including cleared)']) || '0', 10),
      tenth_board:        get(fields, ['10th board', 'tenth board', 'ssc board']) || null,
      tenth_percentage:   parseFloat(get(fields, ['10th marks / percentage', '10th percentage', 'ssc percentage', '10th marks']) || '0') || null,
      twelfth_board:      get(fields, ['12th board', 'twelfth board', 'hsc board']) || null,
      twelfth_percentage: parseFloat(get(fields, ['12th marks / percentage', '12th percentage', 'hsc percentage', '12th marks']) || '0') || null,
      skills:             parseList(get(fields, ['skills', 'technical skills', 'key skills'])),
      projects:           parseList(get(fields, ['projects', 'project names', 'academic projects'])),
      resume_url:         get(fields, ['resume drive link', 'resume url', 'resume link', 'cv link']) || null,
      photo_url:          get(fields, ['passport photo link', 'photo url', 'photo link', 'profile photo']) || null,
    };

    // ── POST to PlacementHub ─────────────────────────────────────────────────
    const url = `${API_URL}/students/webhook/gform/${INSTITUTION_ID}`;
    const options = {
      method:           'post',
      contentType:      'application/json',
      payload:          JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const result     = UrlFetchApp.fetch(url, options);
    const statusCode = result.getResponseCode();

    if (statusCode === 200 || statusCode === 201) {
      Logger.log(`✅ PlacementHub: Queued for Faculty review — ${payload.name} (${payload.roll_number})`);
    } else {
      Logger.log(`❌ PlacementHub Error ${statusCode}: ${result.getContentText()}`);
      // Optional: email yourself on failure
      // MailApp.sendEmail('admin@yourinstitution.edu', 'PlacementHub Form Error', `Error ${statusCode} for ${payload.name}`);
    }

  } catch (err) {
    Logger.log(`❌ PlacementHub Script Error: ${err.toString()}`);
  }
}


// ── Helper: case-insensitive field lookup ────────────────────────────────────
function get(fields, possibleKeys) {
  for (const key of possibleKeys) {
    if (fields[key] !== undefined && fields[key] !== '') {
      return fields[key].toString().trim();
    }
  }
  return '';
}

// ── Helper: split comma or newline separated list ────────────────────────────
function parseList(value) {
  if (!value || value.trim() === '') return [];
  return value.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
}
