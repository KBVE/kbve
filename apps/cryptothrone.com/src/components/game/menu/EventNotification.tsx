import React, { useEffect } from 'react';
import { EventEmitter, type Notification, type NotificationType, type NotificationEventData, notificationsStore, type notificationType } from '@kbve/laser';
import { useStore } from '@nanostores/react';
import { persistentAtom } from '@nanostores/persistent';



const EventNotification: React.FC = () => {
  const notifications = useStore(notificationsStore);

  useEffect(() => {
    const handleNotification = (notification?: NotificationEventData) => {
     if(notification)
     {
      const id = Date.now() + Math.random();
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
            <img src={notification.notificationType.imgUrl} alt={notification.notificationType.type} className="flex-shrink-0 size-4" />
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
