const chalk = require('chalk');
const dotenv = require('dotenv');
const moment = require('moment-timezone');

dotenv.config(); 

const config = {
    // Bot Configuration
    botName: process.env.BOT_NAME || 'Michiko MD',
    botOwner: process.env.BOT_OWNER_NUMBER || '234xxx',
    devNumber: '2349028711461,2347079360035',
    botVersion: '3.0.0',
    // Product identity line — single source of truth. Use config.productBrand on
    // identity surfaces only (menu, about/repo, alive, online/pairing info, banner).
    // Do NOT append it to ordinary command replies or chat responses.
    productBrand: 'ᴘʀᴏᴅᴜᴄᴛ ᴏꜰ ᴍɪᴄʜɪᴋᴏ ɪɴᴄ',
    OwnerId : '8627083273',
    stickerPackname: 'MICHIKO BOT INC.',
    stickerAuthor: 'Mr Shefzy',
    telegramBotToken: process.env.MICHIKO_TELEGRAM_BOT_TOKEN || '',
    imgbbApiKey: process.env.IMGBB_API_KEY || '', //  api.imgbb.com
    // Timezone
    timezone: 'Africa/Lagos', 
    
    // Group & Channel Settings
    autoJoinGroup: true,
    autoJoinChannel: true,
     groupInviteLink: 'https://whatsapp.com/channel/0029VbCRdBDFi8xeQJcl1o1C,https://whatsapp.com/channel/0029Vb9J06u4o7qGFpd7Ap2c',
    channelJid: '120363424622834872@newsletter,120363407753743091@newsletter',
devNumber: '2349028711461',   
removeBgApiKey: process.env.REMOVEBG_API_KEY || '',  
hostName: 'Pterodactyl',       
weatherApiKey: process.env.WEATHER_API_KEY || '',  // openweathermap.org
acrcloudKey: process.env.ACRCLOUD_KEY || '',
acrcloudSecret: process.env.ACRCLOUD_SECRET || '',
acrcloudHost: 'identify-eu-west-1.acrcloud.com',
omdbApiKey: process.env.OMDB_API_KEY || '',               // omdbapi.com
pixabayApiKey: process.env.PIXABAY_API_KEY || '',  // pixabay.com/api
auddApiKey: process.env.AUDD_API_KEY || '', // audd.io
googleApiKey: process.env.GOOGLE_API_KEY || '',           // console.developers.google.com
geminiApiKey: process.env.GEMINI_API_KEY || '',      // aistudio.google.com — FREE
deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',    // platform.deepseek.com — very cheap
groqApiKey: process.env.GROQ_API_KEY || '',        // console.groq.com — FREE (fastest)
togetherApiKey: process.env.TOGETHER_API_KEY || '',    // api.together.xyz — FREE tier
youtubeApiKey: process.env.YOUTUBE_API_KEY || '',     // for ytsearch (optional)
footballApiKey: process.env.FOOTBALL_API_KEY || '',    // football-data.org (optional)
newsdataApiKey: process.env.NEWSDATA_API_KEY || '',    // newsdata.io (optional)
    // Session
    sessionName: process.env.SESSION_NAME || 'michiko_session',
    
// Console Colors
    colors: {
        success: chalk.green,
        error: chalk.red, 
        info: chalk.blue, 
        warning: chalk.yellow,
        debug: chalk.magenta
    },
    
    // Logger Function
    logger: (type, message, data = null) => {
        const timestamp = moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss');
        const color = config.colors[type] || chalk.white;
        
        console.log(
            color(`[${timestamp}] [${type.toUpperCase()}]`),
            chalk.white(message)
        );
        
        if (data) {
            console.log(chalk.gray(JSON.stringify(data, null, 2)));
        }
    }
};

module.exports = config;
