import React, { useEffect } from 'react';
import { EventEmitter, type Notification, type NotificationType, type NotificationEventData, notificationsStore } from '@kbve/laser';
import { useStore } from '@nanostores/react';
import { persistentAtom } from '@nanostores/persistent';

export const notificationTypes: Record<string, NotificationType> = {
    caution: {
      type: 'caution',
      color: 'bg-yellow-200 border-yellow-300 text-yellow-700',
      svg: (
        <svg
          className="flex-shrink-0 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a1.18 1.18 0 001 1.76h19.36a1.18 1.18 0 001-1.76l-8.47-14.14a1.18 1.18 0 00-2.04 0zM12 9v4"></path>
          <path d="M12 17h.01"></path>
        </svg>
      ),
    },
    warning: {
      type: 'warning',
      color: 'bg-orange-200 border-orange-300 text-orange-700',
      svg: (
        <svg
          className="flex-shrink-0 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 9v2"></path>
          <path d="M12 15h.01"></path>
          <path d="M5 12h14"></path>
          <path d="M12 5v2"></path>
        </svg>
      ),
    },
    danger: {
      type: 'danger',
      color: 'bg-red-200 border-red-300 text-red-700',
      svg: (
        <svg
          className="flex-shrink-0 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 12v-2m0-4h.01"></path>
        </svg>
      ),
    },
    success: {
      type: 'success',
      color: 'bg-green-200 border-green-300 text-green-700',
      svg: (
        <svg
          className="flex-shrink-0 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20a8 8 0 110-16 8 8 0 010 16zm-1-9l3 3 3-3m-3 3V9"></path>
        </svg>
      ),
    },
    info: {
      type: 'info',
      color: 'bg-blue-200 border-blue-300 text-blue-700',
      svg: (
        <svg
          className="flex-shrink-0 size-4"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14v-4m0-4h.01"></path>
        </svg>
      ),
    },
  };


const EventNotification: React.FC = () => {
  const notifications = useStore(notificationsStore);

  useEffect(() => {
    const handleNotification = (notification?: NotificationEventData) => {
     if(notification)
     {
      const id = Date.now();
      notificationsStore.set([...notificationsStore.get(), { id, ...notification }]);

      setTimeout(() => {
        notificationsStore.set(notificationsStore.get().filter((n) => n.id !== id));
      }, 5000); // Adjust the timeout duration as needed
    }
    };

    EventEmitter.on('notification', handleNotification);
    return () => {
      EventEmitter.off('notification', handleNotification);
    };
  }, []);

  const removeNotification = (id: number) => {
    notificationsStore.set(notificationsStore.get().filter((notification) => notification.id !== id));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 m-4 space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`hs-removing:translate-x-5 hs-removing:opacity-0 transition duration-300 max-w-xs border rounded-xl shadow-lg ${notification.notificationType.color}`}
          role="alert"
        >
          <div className="flex p-4">
            {notification.notificationType.svg}
            <div className="ms-2">
              <h3 className="text-sm font-bold">{notification.title}</h3>
              <p className="text-sm">{notification.message}</p>
            </div>
            <div className="ms-auto">
              <button
                type="button"
                className="inline-flex flex-shrink-0 justify-center items-center size-5 rounded-lg text-gray-800 opacity-50 hover:opacity-100 focus:outline-none focus:opacity-100 dark:text-white"
                onClick={() => removeNotification(notification.id)}
              >
                <span className="sr-only">Close</span>
                <svg
                  className="flex-shrink-0 size-4 bg-zinc-900"
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18"></path>
                  <path d="m6 6 12 12"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default EventNotification;
