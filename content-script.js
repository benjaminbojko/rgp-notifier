let reloadIntervalId = null;
let originalFaviconUrl = null;

const reloadInterval = 30 * 1000; // ms

const customButtons = new Set();
const selectedSlots = new Set();
const selectedSlotDates = new Map();
const notifications = new Set();

const reloadDispatcher = new EventTarget();

const currentDayClass = 'ui-datepicker-current-day';
const waitingIconUrl = chrome.runtime.getURL('images/timer-line-96x96.png');
const availableIconUrl = chrome.runtime.getURL(
  'images/alarm-warning-line-96x96.png'
);

/*=================================
  Cosmetics
*/

/**
 * @param {String} style Supports 'waiting', 'available' and 'default'
 */
function changeFavicon(style) {
  let linkEl = document.querySelector("link[rel~='icon']");
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
    case 'waiting':
      linkEl.href = waitingIconUrl;
      break;
    case 'available':
      linkEl.href = availableIconUrl;
      break;
    case 'default':
    default:
      linkEl.href = originalFaviconUrl;
      break;
  }
}

/*=================================
  Notifications
*/

function closeAllNotifications() {
  for (const notification of notifications) {
    notification.close();
  }
  notifications.clear();
}

function notifyAvailableSlot(slotText) {
  cancelSlotNotification(slotText);
  changeFavicon('available');

  const logoEl = document.querySelector('#fullpage-mode-logo img');

  const notification = new Notification('🚨 Slot Available 🚨', {
    body: `Time: ${slotText.trim()}`,
    icon: logoEl ? logoEl.src : '',
  });

  notification.onclick = (e) => {
    window.focus();
    notification.close();

    const date = selectedSlotDates.get(slotText);
    const dayButton = getButtonFromDate(date);
    if (dayButton) {
      dayButton.click();
    }
  };
  notifications.add(notification);
}

function cancelSlotNotification(slotText, dontUpdateUi) {
  selectedSlots.delete(slotText);
  selectedSlotDates.delete(slotText);
  if (selectedSlots.size === 0) {
    stopReloading();
    changeFavicon('default');
  }
  if (!dontUpdateUi) {
    updateCustomUi();
  }
}

/*=================================
  UI
*/

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
    } else if (isSelected && !isAvailable) {
      // show cancel button for selected slots
      addCancelButton(selectionEl, slotText);
    } else if (!isSelected && !isAvailable) {
      // show notify button for fully booked slots
      addNotifyButton(selectionEl, slotText);
    }
  }
}

function addCancelButton(selectionEl, slotText) {
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
}

function addNotifyButton(selectionEl, slotText) {
  const notifyButton = document.createElement('a');
  notifyButton.className = 'rgp-btn rgp-notify-btn';
  notifyButton.innerText = 'Notify Me';
  notifyButton.addEventListener(
    'click',
    () => {
      const dateButton = getCurrentDayButton();

      Notification.requestPermission();
      selectedSlots.add(slotText);
      selectedSlotDates.set(slotText, getDateFromDayButton(dateButton));

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

/*=================================
  State
*/

function startReloading() {
  stopReloading();
  reload();
  reloadIntervalId = setInterval(reload, reloadInterval);
}

function stopReloading() {
  if (reloadIntervalId !== null) {
    clearInterval(reloadIntervalId);
  }
  reloadIntervalId = null;
}

function getCurrentDayButton() {
  return document.querySelector(`.${currentDayClass}`);
}

function getDateFromDayButton(dateButton) {
  const dateYear = parseInt(dateButton.dataset.year);
  const dateMonth = parseInt(dateButton.dataset.month);
  const dateDay = parseInt(dateButton.querySelector('a').innerText);
  return new Date(dateYear, dateMonth, dateDay);
}

/**
 * Returns the button that selects the provided date.
 *
 * Returns null if the button can't be found (e.g. another month was selected).
 *
 * Since buttons get recreated all the time, we can't store them and
 * have to find a way to look them up from the UI.
 * @param {Date} date
 * @returns
 */
function getButtonFromDate(date) {
  const allButtons = document.querySelectorAll('[data-handler="selectDay"]');

  for (const button of allButtons) {
    // We have to get each date button freshly from the DOM, since they get re-generated by RGP
    const buttonDate = getDateFromDayButton(button);
    if (
      buttonDate.getFullYear() === date.getFullYear() &&
      buttonDate.getMonth() === date.getMonth() &&
      buttonDate.getDate() === date.getDate()
    ) {
      return button;
    }
  }

  console.error(`No button found for ${date}`);

  return null;
}

function reload() {
  // // -- The code below might allow updating multiple days
  // // -- We'd have to chain each button click with a reload callback, then move on to the next button
  // const selectedButtons = new Set();
  // const currentDayButton = getCurrentDayButton();

  // for (const [slotText, slotDate] of selectedSlotDates) {
  //   // We have to get each date button freshly from the DOM, since they get re-generated by RGP
  //   const button = getButtonFromDate(slotDate);
  //   if (button) {
  //     selectedButtons.add(button);
  //   }
  // }

  // // triggers reload via UI on currently selected day
  // for (const button of selectedButtons) {
  //   if (button !== currentDayButton) {
  //     button.click();
  //   }
  // }
  
  getCurrentDayButton().click();
}

function isSpinnerVisible() {
  const spinner = document.getElementById('spinner');
  return !!spinner && spinner.style.display !== 'none';
}

function listenForReloads() {
  const spinner = document.getElementById('spinner');
  let wasSpinnerVisible = isSpinnerVisible();
  const observer = new MutationObserver(function (mutations) {
    const isVisible = isSpinnerVisible();
    if (isVisible && !wasSpinnerVisible) {
      reloadDispatcher.dispatchEvent(new Event('reloading'));
    } else if (!isVisible && wasSpinnerVisible) {
      reloadDispatcher.dispatchEvent(new Event('reloaded'));
    }
    wasSpinnerVisible = isVisible;
  });
  observer.observe(spinner, {
    attributes: true,
    attributeFilter: ['style'],
  });
}

/*=================================
  Bootstrap
*/

function init() {
  
  reloadDispatcher.addEventListener('reloaded', updateCustomUi);
  
  listenForReloads();

  // document.addEventListener('visibilitychange', () => {
  // 	if (document.visibilityState === 'visible') {
  // 		closeAllNotifications();
  // 	}
  // });

  window.addEventListener('beforeunload', closeAllNotifications);
}

init();
