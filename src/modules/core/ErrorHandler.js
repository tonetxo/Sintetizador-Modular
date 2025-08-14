export class ErrorHandler {
    constructor() {
        this.errorContainer = this._createErrorContainer();
        this.notifications = [];
    }

    _createErrorContainer() {
        const container = document.createElement('div');
        container.className = 'error-notification-container';
        document.body.appendChild(container);
        return container;
    }

    showError(error, duration = 5000) {
        const notification = this._createNotification('error', error.message);
        this._showNotification(notification, duration);
    }

    showWarning(message, duration = 3000) {
        const notification = this._createNotification('warning', message);
        this._showNotification(notification, duration);
    }

    showSuccess(message, duration = 2000) {
        const notification = this._createNotification('success', message);
        this._showNotification(notification, duration);
    }

    _createNotification(type, message) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-icon">${this._getIcon(type)}</div>
            <div class="notification-message">${message}</div>
            <button class="notification-close">×</button>
        `;

        notification.querySelector('.notification-close').addEventListener('click', () => {
            this._removeNotification(notification);
        });

        return notification;
    }

    _showNotification(notification, duration) {
        this.errorContainer.appendChild(notification);
        this.notifications.push(notification);

        // Animar entrada
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        });

        if (duration) {
            setTimeout(() => {
                this._removeNotification(notification);
            }, duration);
        }
    }

    _removeNotification(notification) {
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            this.notifications = this.notifications.filter(n => n !== notification);
        }, 300);
    }

    _getIcon(type) {
        switch (type) {
            case 'error':
                return '⚠️';
            case 'warning':
                return '⚡';
            case 'success':
                return '✓';
            default:
                return 'ℹ️';
        }
    }
}