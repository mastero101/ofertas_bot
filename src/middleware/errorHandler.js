function errorHandler(err, req, res, next) {
    console.error('Error:', err);

    // Si es un error de validación de Sequelize
    if (err.name === 'SequelizeValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Error de validación',
            details: err.errors.map(e => e.message)
        });
    }

    // Si es un error de base de datos
    if (err.name === 'SequelizeDatabaseError') {
        return res.status(500).json({
            success: false,
            error: 'Error de base de datos',
            message: 'Ha ocurrido un error al procesar la solicitud'
        });
    }

    // Para errores en rutas API
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Error interno del servidor'
        });
    }

    // Para errores en rutas de vistas
    res.status(err.status || 500).render('error', {
        message: err.message || 'Ha ocurrido un error inesperado'
    });
}

module.exports = errorHandler; 