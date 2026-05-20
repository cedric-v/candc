import { html } from "../_lib/http.js";
import { htmlDocument } from "../_lib/ui.js";

export function onRequestGet() {
  const body = `
    <section class="hero">
      <h1>Booking admin</h1>
      <p>Use a dedicated admin token to review reservations, add special pricing periods, and manually launch the key operational jobs.</p>
    </section>
    <div class="grid cols-2">
      <section class="card stack">
        <h2>Access</h2>
        <form id="admin-auth-form">
          <div class="field">
            <label for="adminToken">Admin token</label>
            <input id="adminToken" name="adminToken" type="password" autocomplete="off" placeholder="Paste the admin token here">
          </div>
          <div class="actions">
            <button class="btn-primary" type="submit">Load dashboard</button>
          </div>
        </form>
        <div id="admin-notice" class="notice info">Paste your admin token to load the dashboard.</div>
      </section>
      <section class="card stack">
        <h2>Quick actions</h2>
        <div class="actions">
          <button class="btn-secondary" type="button" id="sync-booking-button">Run calendar sync</button>
          <button class="btn-secondary" type="button" id="send-arrival-button">Send today's arrival emails</button>
        </div>
        <p class="small">These actions reuse the same backend jobs that will later be called by automated triggers. They sync all active imported OTA calendars configured in the system.</p>
      </section>
    </div>
    <section class="card stack" style="margin-top:18px">
      <h2>Special pricing period</h2>
      <form id="rate-period-form" class="stack">
        <div class="field-row three">
          <div class="field">
            <label for="unitId">Unit</label>
            <select id="unitId" name="unitId"></select>
          </div>
          <div class="field">
            <label for="startDate">Start date</label>
            <input id="startDate" name="startDate" type="date" required>
          </div>
          <div class="field">
            <label for="endDate">End date</label>
            <input id="endDate" name="endDate" type="date" required>
          </div>
        </div>
        <div class="field-row three">
          <div class="field">
            <label for="nightlyBaseRate">Nightly base rate (CHF)</label>
            <input id="nightlyBaseRate" name="nightlyBaseRate" type="number" min="0" step="0.01" required>
          </div>
          <div class="field">
            <label for="label">Label</label>
            <input id="label" name="label" type="text" placeholder="2026 Hockey Worlds">
          </div>
          <div class="field">
            <label for="priority">Priority</label>
            <input id="priority" name="priority" type="number" min="1" step="1" value="100">
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" type="submit">Save pricing period</button>
        </div>
      </form>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Recent reservations</h2>
      <div id="admin-reservations" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Configured pricing periods</h2>
      <div id="admin-rate-periods" class="small">No data loaded yet.</div>
    </section>
    <section class="card stack" style="margin-top:18px">
      <h2>Recent sync logs</h2>
      <div id="admin-sync-logs" class="small">No data loaded yet.</div>
    </section>
    <script>
      (() => {
        const apiUrl = '/api/admin/booking';
        const authForm = document.getElementById('admin-auth-form');
        const ratePeriodForm = document.getElementById('rate-period-form');
        const adminNotice = document.getElementById('admin-notice');
        const unitSelect = document.getElementById('unitId');
        const reservationsWrap = document.getElementById('admin-reservations');
        const ratePeriodsWrap = document.getElementById('admin-rate-periods');
        const syncLogsWrap = document.getElementById('admin-sync-logs');
        const syncBookingButton = document.getElementById('sync-booking-button');
        const sendArrivalButton = document.getElementById('send-arrival-button');
        let adminToken = sessionStorage.getItem('candcAdminToken') || '';

        if (adminToken) {
          document.getElementById('adminToken').value = adminToken;
          loadDashboard();
        }

        async function apiFetch(method, body) {
          const response = await fetch(apiUrl, {
            method,
            headers: {
              'content-type': 'application/json',
              'x-admin-token': adminToken,
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || 'Request failed');
          }
          return data;
        }

        function renderTable(rows, headers) {
          if (!rows.length) {
            return '<p class="small">No data yet.</p>';
          }
          return '<table><thead><tr>' + headers.map((header) => '<th>' + header.label + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((header) => '<td>' + (row[header.key] ?? '-') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        }

        async function loadDashboard() {
          adminNotice.className = 'notice info';
          adminNotice.textContent = 'Loading dashboard…';
          try {
            const data = await apiFetch('GET');
            unitSelect.innerHTML = data.units.map((unit) => '<option value="' + unit.id + '">' + unit.display_name + '</option>').join('');
            reservationsWrap.innerHTML = renderTable(
              data.reservations.map((item) => ({
                reference: item.public_reference,
                unit: item.unit_display_name,
                stay: item.check_in_date + ' → ' + item.check_out_date,
                guest: item.guest_first_name + ' ' + item.guest_last_name,
                status: item.status + ' / ' + (item.payment_status || '-'),
                total: item.total_amount + ' ' + item.currency,
              })),
              [
                { key: 'reference', label: 'Reference' },
                { key: 'unit', label: 'Unit' },
                { key: 'stay', label: 'Stay' },
                { key: 'guest', label: 'Guest' },
                { key: 'status', label: 'Status' },
                { key: 'total', label: 'Total' },
              ],
            );
            ratePeriodsWrap.innerHTML = renderTable(
              data.ratePeriods.map((item) => ({
                unit: item.unit_display_name,
                period: item.start_date + ' → ' + item.end_date,
                rate: item.nightly_base_rate + ' CHF',
                label: item.label || '-',
                priority: item.priority,
              })),
              [
                { key: 'unit', label: 'Unit' },
                { key: 'period', label: 'Period' },
                { key: 'rate', label: 'Nightly rate' },
                { key: 'label', label: 'Label' },
                { key: 'priority', label: 'Priority' },
              ],
            );
            syncLogsWrap.innerHTML = renderTable(
              data.syncLogs.map((item) => ({
                when: item.created_at,
                type: item.sync_type,
                unit: item.unit_display_name || '-',
                status: item.status,
                message: item.message || '-',
              })),
              [
                { key: 'when', label: 'When' },
                { key: 'type', label: 'Type' },
                { key: 'unit', label: 'Unit' },
                { key: 'status', label: 'Status' },
                { key: 'message', label: 'Message' },
              ],
            );
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Dashboard loaded.';
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        }

        authForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          adminToken = document.getElementById('adminToken').value.trim();
          sessionStorage.setItem('candcAdminToken', adminToken);
          await loadDashboard();
        });

        ratePeriodForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            await apiFetch('POST', {
              action: 'create_rate_period',
              unitId: ratePeriodForm.elements.unitId.value,
              startDate: ratePeriodForm.elements.startDate.value,
              endDate: ratePeriodForm.elements.endDate.value,
              nightlyBaseRate: ratePeriodForm.elements.nightlyBaseRate.value,
              label: ratePeriodForm.elements.label.value,
              priority: ratePeriodForm.elements.priority.value,
            });
            adminNotice.className = 'notice success';
            adminNotice.textContent = 'Pricing period saved.';
            ratePeriodForm.reset();
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        syncBookingButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Running calendar sync…';
            await apiFetch('POST', { action: 'run_booking_sync' });
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });

        sendArrivalButton.addEventListener('click', async () => {
          try {
            adminNotice.className = 'notice info';
            adminNotice.textContent = 'Sending arrival emails…';
            await apiFetch('POST', { action: 'run_arrival_emails' });
            await loadDashboard();
          } catch (error) {
            adminNotice.className = 'notice error';
            adminNotice.textContent = error.message;
          }
        });
      })();
    </script>
  `;

  return html(
    htmlDocument({
      title: "Booking admin",
      body,
      lang: "en",
    }),
  );
}
