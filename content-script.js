let reloadIntervalId = null;
let originalFaviconUrl = null;

const reloadInterval = 3 * 1000; // ms
const uiRefreshInterval = 20;

const customButtons = new Set();
const selectedSlots = new Set();
const selectedSlotDayButtons = new Map();
const notifications = new Set();

const waitingIconUrl = chrome.runtime.getURL('images/timer-line-96x96.png');
const availableIconUrl = chrome.runtime.getURL('images/alarm-warning-line-96x96.png');

function changeFavicon(style) {
  let linkEl = document.querySelector('link[rel~=\'icon\']');
	if (!linkEl) {
		originalFaviconUrl = '/favicon.ico';
    linkEl = document.createElement('link');
    linkEl.rel = 'icon';
    document.querySelector('head').appendChild(linkEl);
}
	if (!originalFaviconUrl) {
		originalFaviconUrl = linkEl.href;
	}
  switch (style) {
		case 'waiting': linkEl.href = waitingIconUrl; break;
		case 'available': linkEl.href = availableIconUrl; break;
		case 'default': default: linkEl.href = originalFaviconUrl; break;
	}
}

function closeAllNotifications() {
  for (const notification of notifications) {
    notification.close();
  }
  notifications.clear();
}

function notifyAvailableSlot(slotText) {
  stopReloading();
  updateCustomUi();
	changeFavicon('available');

  const logoEl = document.querySelector('#fullpage-mode-logo img');

  const notification = new Notification('🚨 Slot Available 🚨', {
    body: `Time: ${slotText.trim()}`,
    icon: logoEl ? logoEl.src : '',
  });

  notification.onclick = (e) => {
    window.focus();
    notification.close();

    const dayButton = selectedSlotDayButtons.get(slotText);
    if (dayButton) {
      dayButton.click();
    }
  };
  notifications.add(notification);
}

function cancelSlotNotification(slotText) {
  selectedSlots.delete(slotText);
  selectedSlotDayButtons.delete(slotText);
  if (selectedSlots.size === 0) {
    stopReloading();
		changeFavicon('default');
	}
  updateCustomUi();
}

function updateCustomUi() {
  // Remove old buttons
  customButtons.forEach((button) => {
    if (button.parentElement) {
      button.parentElement.removeChild(button);
    }
  });
  customButtons.clear();

  // Add new buttons
  const timeSlotRows = document.querySelectorAll(
    '#offering-page-select-events-table tr'
  );

  for (const timeSlotRow of timeSlotRows) {
    const selectButton = timeSlotRow.querySelector('.book-now-button');
    const selectionEl = timeSlotRow.querySelector('td:last-of-type');
    const timeSlotEl = timeSlotRow.querySelector(
      '.offering-page-schedule-list-time-column'
    );

    const slotText = timeSlotEl.textContent;
    const isSelected = selectedSlots.has(slotText);
    const isAvailable = !!selectButton;

    if (isSelected && isAvailable) {
      // selected slot became available
      notifyAvailableSlot(slotText);
      continue;
			
    } else if (isAvailable) {
      // don't add UI if this slot was already available
      continue;
			
    } else if (isSelected) {
      // show cancel label
      const cancelButton = document.createElement('a');
      cancelButton.className = 'rgp-btn rgp-cancel-btn';
      cancelButton.innerText = 'Cancel Notification';
      cancelButton.addEventListener(
        'click',
        () => {
          cancelSlotNotification(slotText);
        },
        {
          capture: true,
          once: true,
          passive: true,
        }
      );
      customButtons.add(cancelButton);
      selectionEl.appendChild(cancelButton);
			
    } else {
      // show notify button
      const notifyButton = document.createElement('a');
      notifyButton.className = 'rgp-btn rgp-notify-btn';
      notifyButton.innerText = 'Notify Me';
      notifyButton.addEventListener(
        'click',
        () => {
          Notification.requestPermission();
          selectedSlots.add(slotText);
          selectedSlotDayButtons.set(slotText, getCurrentDayButton());
          updateCustomUi();
          startReloading();
					changeFavicon('waiting');
          // setTimeout(() => { notifyAvailableSlot(slotText); }, 2000); // for testing
        },
        {
          capture: true,
          once: true,
          passive: true,
        }
      );
      customButtons.add(notifyButton);
      selectionEl.appendChild(notifyButton);
    }
  }
}

function startReloading() {
  stopReloading();
  reloadIntervalId = setInterval(reload, reloadInterval);
}

function stopReloading() {
  if (reloadIntervalId !== null) {
    clearInterval(reloadIntervalId);
  }
  reloadIntervalId = null;
}

function getCurrentDayButton() {
  return document.querySelector('.ui-datepicker-current-day');
}

function reload() {
  getCurrentDayButton().click(); // triggers reload via UI on currently selected day
}

function isSpinnerVisible() {
  const spinner = document.getElementById('spinner');
  return !!spinner && spinner.style.display !== 'none';
}

function listenForReloads(callbackFn) {
  const spinner = document.getElementById('spinner');
  let wasSpinnerVisible = isSpinnerVisible();
  const observer = new MutationObserver(function (mutations) {
    if (isSpinnerVisible() !== wasSpinnerVisible && callbackFn) {
      callbackFn();
    }
    wasSpinnerVisible = isSpinnerVisible();
  });
  observer.observe(spinner, {
    attributes: true,
    attributeFilter: ['style'],
  });
}

function init() {
  listenForReloads(updateCustomUi);

  // document.addEventListener('visibilitychange', () => {
  // 	if (document.visibilityState === 'visible') {
  // 		closeAllNotifications();
  // 	}
  // });

  window.addEventListener('beforeunload', closeAllNotifications);
	
}

init();
