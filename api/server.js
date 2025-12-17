const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = 5678;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: '/uploads/' });

// Email configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Helper function to parse book filename
function parseBookInfo(filepath) {
    const filename = path.basename(filepath);
    const dirName = path.basename(path.dirname(filepath));
    const format = filepath.endsWith('.mobi') ? 'mobi' : 'epub';
    
    // Try to parse "Author - Title.epub" format first
    const parts = filename.split(' - ');
    
    let author, title;
    
    if (parts.length > 1) {
        // Standard "Author - Title" format
        author = parts[0];
        title = parts[1]?.replace(/\.(epub|mobi)$/i, '');
    } else {
        // Non-standard format - use directory name as author if available
        // Clean up the filename first
        let cleanTitle = filename
            .replace(/\.(epub|mobi)$/i, '')
            .replace(/\./g, ' ')  // Replace dots with spaces
            .replace(/\s+/g, ' ') // Normalize multiple spaces
            .trim();
        
        // If we're in an author folder, use that as the author
        if (dirName && dirName !== 'Books' && !dirName.includes('/')) {
            author = dirName;
            title = cleanTitle;
        } else {
            author = 'Unknown';
            title = cleanTitle;
        }
    }
    
    return {
        filepath,
        filename,
        author,
        title,
        format
    };
}

// GET /api/sync-library - Scan and return all books
app.post('/api/sync-library', async (req, res) => {
    try {
        console.log('Scanning library...');
        
        // Find all EPUB files - Amazon converts them automatically
        const { stdout } = await execPromise(
            "find /mnt/nas/media/Books -type f -name '*.epub'"
        );
        
        const files = stdout.split('\n').filter(f => f);
        console.log(`Found ${files.length} EPUB files`);
        
        // Process into book objects
        const books = files.map((filepath, index) => {
            const bookInfo = parseBookInfo(filepath);
            return {
                id: index,
                ...bookInfo,
                status: 'ready',
                added: new Date().toISOString()
            };
        });
        
        console.log(`Returning ${books.length} books`);
        
        res.json(books);
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Conversion endpoint removed - Amazon handles EPUB conversion automatically

// POST /api/delete-books - Delete multiple book files
app.post('/api/delete-books', async (req, res) => {
    try {
        const { filepaths } = req.body;
        let deleted = 0;
        let failed = 0;
        
        console.log(`Bulk deleting ${filepaths.length} files...`);
        
        for (const filepath of filepaths) {
            try {
                await execPromise(`rm -f "${filepath}"`);
                // Also delete MOBI if it's an EPUB
                if (filepath.endsWith('.epub')) {
                    const mobiPath = filepath.replace('.epub', '.mobi');
                    await execPromise(`rm -f "${mobiPath}"`);
                }
                deleted++;
            } catch (error) {
                console.error(`Failed to delete ${filepath}:`, error.message);
                failed++;
            }
        }
        
        console.log(`Deleted ${deleted} files, ${failed} failed`);
        res.json({ 
            status: 'success', 
            message: `Deleted ${deleted} books`,
            deleted,
            failed
        });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/delete-book - Delete a book file
app.post('/api/delete-book', async (req, res) => {
    try {
        const { filepath } = req.body;
        
        console.log(`Deleting: ${filepath}`);
        
        // Use exec to run rm command with proper permissions
        try {
            await execPromise(`rm -f "${filepath}"`);
            console.log(`Deleted: ${filepath}`);
            
            // Also try to delete MOBI version if it's an EPUB
            if (filepath.endsWith('.epub')) {
                const mobiPath = filepath.replace('.epub', '.mobi');
                await execPromise(`rm -f "${mobiPath}"`);
                console.log(`Also deleted MOBI: ${mobiPath}`);
            }
        } catch (cmdError) {
            console.error('Command error:', cmdError);
            // Try with sudo if regular rm fails
            try {
                await execPromise(`sudo rm -f "${filepath}"`);
                console.log(`Deleted with sudo: ${filepath}`);
            } catch (sudoError) {
                throw new Error(`Cannot delete file: ${sudoError.message}`);
            }
        }
        
        res.json({ 
            status: 'success', 
            message: 'Book deleted successfully' 
        });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/send-books - Send books to Kindle
app.post('/api/send-books', async (req, res) => {
    try {
        const { books, email } = req.body;
        
        console.log(`Sending ${books.length} books to ${email}`);
        
        for (const book of books) {
            const filepath = book.filepath;
            
            // Check if file exists
            try {
                await fs.access(filepath);
            } catch {
                console.log(`File not found: ${filepath}, skipping...`);
                continue;
            }
            
            // Send email with attachment
            // Amazon requires "Convert" subject for EPUB files
            const mailOptions = {
                from: process.env.SMTP_SENDER || process.env.SMTP_USER,
                to: email,
                subject: 'Convert', // Always "Convert" since we only send EPUBs
                text: `${book.title} by ${book.author}`,
                attachments: [{
                    filename: path.basename(filepath),
                    path: filepath
                }]
            };
            
            console.log(`Attempting to send email from: ${mailOptions.from} to: ${email}`);
            console.log(`Attachment: ${filepath} (${path.basename(filepath)})`);
            
            try {
                const info = await transporter.sendMail(mailOptions);
                console.log(`Email sent successfully! MessageId: ${info.messageId}`);
                console.log(`Response: ${info.response}`);
                console.log(`Sent: ${book.title} to ${email}`);
            } catch (emailError) {
                console.error(`Failed to send ${book.title} to ${email}:`, emailError.message);
                console.error('Full error:', emailError);
                throw emailError;
            }
        }
        
        res.json({ 
            status: 'success', 
            message: `Sent ${books.length} books to ${email}` 
        });
    } catch (error) {
        console.error('Send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Batch conversion endpoint removed - Amazon handles EPUB conversion automatically

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// POST /api/test-email - Test email configuration
app.post('/api/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log(`Testing email to: ${email}`);
        console.log(`SMTP Config: Host=${process.env.SMTP_HOST}, Port=${process.env.SMTP_PORT}, User=${process.env.SMTP_USER}`);
        
        const testMailOptions = {
            from: process.env.SMTP_SENDER || process.env.SMTP_USER,
            to: email,
            subject: 'Kindle Converter - Test Email',
            text: 'This is a test email from your Kindle Converter. If you receive this, email is working correctly!\n\nNote: When sending books to Kindle, make sure this sender email is in your Amazon approved email list.',
            html: '<p>This is a test email from your Kindle Converter.</p><p>If you receive this, email is working correctly!</p><p><strong>Important:</strong> When sending books to Kindle, make sure this sender email is in your Amazon approved email list.</p>'
        };
        
        console.log(`Sending test from: ${testMailOptions.from}`);
        
        const info = await transporter.sendMail(testMailOptions);
        
        console.log('Test email sent successfully!');
        console.log(`MessageId: ${info.messageId}`);
        console.log(`Response: ${info.response}`);
        
        res.json({ 
            status: 'success', 
            message: `Test email sent to ${email}`,
            messageId: info.messageId,
            response: info.response,
            from: testMailOptions.from
        });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ 
            error: error.message,
            details: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER,
                sender: process.env.SMTP_SENDER
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`Kindle API server running on port ${PORT}`);
    console.log('Endpoints:');
    console.log('  POST /api/sync-library');
    console.log('  POST /api/delete-book');
    console.log('  POST /api/delete-books (bulk)');
    console.log('  POST /api/send-books');
    console.log('  POST /api/test-email');
    console.log('  GET  /api/health');
});