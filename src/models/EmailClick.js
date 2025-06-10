const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { Email } = require('./Email');

const EmailClick = sequelize.define('EmailClick', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    emailId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Emails',
            key: 'id'
        }
    },
    clickedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: true,
    tableName: 'EmailClicks'
});

EmailClick.belongsTo(Email, { foreignKey: 'emailId' });
Email.hasMany(EmailClick, { foreignKey: 'emailId' });

module.exports = EmailClick; 