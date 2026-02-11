const { BasePlugin } = require('./BasePlugin');
const nodemailer = require('nodemailer');

class EmailAgent extends BasePlugin {
  constructor() {
    super();
    this.name = 'email-agent';
    this.version = '1.0.0';
    this.transporter = null;
  }

  async onInitialize() {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    console.log('EmailAgent initialized successfully');
  }

  async onCleanup() {
    if (this.transporter) {
      await this.transporter.close();
    }
  }

  async sendEmail(options) {
    if (!this.isActive) {
      throw new Error('EmailAgent is not active');
    }

    const mailOptions = {
      from: options.from || process.env.EMAIL_USER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      return { messageId: info.messageId, response: info.response };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async readEmails(options = {}) {
    if (!this.isActive) {
      throw new Error('EmailAgent is not active');
    }

    // This would require IMAP integration
    // For now, return a placeholder
    return {
      emails: [],
      total: 0,
      unread: 0
    };
  }

  async scheduleMeeting(meetingDetails) {
    // Create calendar event and send invitation
    const emailContent = `
      <h2>Meeting Invitation</h2>
      <p>You are invited to the following meeting:</p>
      <ul>
        <li><strong>Subject:</strong> ${meetingDetails.subject}</li>
        <li><strong>Date:</strong> ${meetingDetails.date}</li>
        <li><strong>Time:</strong> ${meetingDetails.time}</li>
        <li><strong>Duration:</strong> ${meetingDetails.duration} minutes</li>
        <li><strong>Location:</strong> ${meetingDetails.location || 'Online'}</li>
      </ul>
      <p><a href="${meetingDetails.calendarLink}">Add to Calendar</a></p>
    `;

    await this.sendEmail({
      to: meetingDetails.attendees,
      subject: `Meeting Invitation: ${meetingDetails.subject}`,
      html: emailContent
    });

    return { success: true, message: 'Meeting invitation sent' };
  }
}

module.exports = {
  EmailAgent
};
