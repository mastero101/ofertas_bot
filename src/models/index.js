const Campaign = require('./Campaign');
const { Email, EmailClick } = require('./Email');

// Establecer las relaciones entre modelos
Campaign.hasMany(Email, { foreignKey: 'campaignId' });
Email.belongsTo(Campaign, { foreignKey: 'campaignId' });

Email.hasMany(EmailClick, { foreignKey: 'emailId' });
EmailClick.belongsTo(Email, { foreignKey: 'emailId' });

module.exports = {
    Campaign,
    Email,
    EmailClick
}; 