/**
 * PlacementHub - Google Forms Integration Script
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Form → click 3-dot menu → Script editor
 * 2. Paste this entire script
 * 3. Replace INSTITUTION_ID and API_URL with your actual values
 * 4. Click Save, then set up a trigger:
 *    → Triggers → Add Trigger → onFormSubmit → Form Submit
 * 5. Done! Every new form submission will be sent to PlacementHub.
 *
 * FORM FIELD MAPPING:
 * Your Google Form questions must be named EXACTLY as shown in the
 * fieldMap below (case-insensitive matching is applied).
 */

const INSTITUTION_ID = 'YOUR_INSTITUTION_ID_HERE';  // Get from PlacementHub onboarding
const API_URL = 'https://your-placementhub-domain.com/api';  // Your deployed API URL

function onFormSubmit(e) {
  try {
    const response = e.response;
    const itemResponses = response.getItemResponses();
    
    // Map form field titles to their answers
    const fields = {};
    itemResponses.forEach(item => {
      const title = item.getItem().getTitle().toLowerCase().trim();
      fields[title] = item.getResponse();
    });
    
    // Build the PlacementHub webhook payload
    // Field names below must match your Google Form question titles (case-insensitive)
    const payload = {
      name:               getField(fields, ['full name', 'name', 'student name']),
      roll_number:        getField(fields, ['roll number', 'roll no', 'enrollment number']),
      dob:                getField(fields, ['date of birth', 'dob', 'birth date']),
      gender:             getField(fields, ['gender', 'sex']),
      mobile:             getField(fields, ['mobile', 'phone', 'contact number', 'mobile number']),
      personal_email:     getField(fields, ['personal email', 'gmail', 'personal mail']),
      institute_email:    getField(fields, ['institute email', 'college email', 'official email']),
      program_name:       getField(fields, ['program', 'course', 'program name', 'degree']),
      department_name:    getField(fields, ['department', 'branch', 'department name']),
      class_name:         getField(fields, ['class', 'section', 'class name', 'division']),
      cgpa:               parseFloat(getField(fields, ['cgpa', 'gpa', 'aggregate cgpa', 'current cgpa']) || '0'),
      active_backlogs:    parseInt(getField(fields, ['active backlogs', 'current backlogs', 'live backlogs']) || '0'),
      total_backlogs:     parseInt(getField(fields, ['total backlogs', 'total backlogs (including cleared)', 'all backlogs']) || '0'),
      tenth_board:        getField(fields, ['10th board', 'tenth board', 'ssc board']),
      tenth_marks:        parseFloat(getField(fields, ['10th marks', 'tenth marks', 'ssc marks']) || '0'),
      tenth_percentage:   parseFloat(getField(fields, ['10th percentage', 'tenth percentage', 'ssc percentage']) || '0'),
      twelfth_board:      getField(fields, ['12th board', 'twelfth board', 'hsc board']) || null,
      twelfth_marks:      parseFloat(getField(fields, ['12th marks', 'twelfth marks', 'hsc marks']) || '0') || null,
      twelfth_percentage: parseFloat(getField(fields, ['12th percentage', 'twelfth percentage', 'hsc percentage']) || '0') || null,
      skills:             parseList(getField(fields, ['skills', 'technical skills', 'key skills'])),
      projects:           parseList(getField(fields, ['projects', 'project names', 'academic projects'])),
      resume_url:         getField(fields, ['resume url', 'resume link', 'cv link']) || null,
      photo_url:          getField(fields, ['photo url', 'photo link', 'passport photo url']) || null,
    };
    
    // Send to PlacementHub
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const url = `${API_URL}/students/webhook/gform/${INSTITUTION_ID}`;
    const result = UrlFetchApp.fetch(url, options);
    const status = result.getResponseCode();
    
    if (status === 200 || status === 201) {
      Logger.log('✅ PlacementHub: Submission forwarded successfully for ' + payload.name);
    } else {
      Logger.log('❌ PlacementHub: Error ' + status + ' - ' + result.getContentText());
    }
    
  } catch (err) {
    Logger.log('❌ PlacementHub Script Error: ' + err.toString());
  }
}

// Helper: find a field value by trying multiple possible question titles
function getField(fields, possibleKeys) {
  for (const key of possibleKeys) {
    if (fields[key] !== undefined && fields[key] !== '') {
      return fields[key].toString().trim();
    }
  }
  return '';
}

// Helper: parse comma/newline separated list into array
function parseList(value) {
  if (!value) return [];
  return value.split(/[\,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
}
