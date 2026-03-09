import { t } from '../i18n.js';
import {
  escHtml,
  truncate,
  formatTs,
  capitalize,
  toTitleCase,
  parseJson,
} from './brain-helpers.js';
import { brainGetEntity, brainGetConversation, brainUpdateEntity, brainDelete } from './ipc.js';

export class BrainDetailController {
  private readonly detailPanel: HTMLElement;
  private readonly detailTitle: HTMLSpanElement;
  private readonly detailBody: HTMLDivElement;
  private readonly detailDelete: HTMLButtonElement;
  private readonly deleteDialog: HTMLDivElement;
  private readonly deleteDialogText: HTMLDivElement;
  private readonly deleteDialogWarning: HTMLDivElement;
  private readonly deleteCancel: HTMLButtonElement;
  private readonly deleteConfirm: HTMLButtonElement;
  private readonly onDataChanged: () => void;
  private selectedId: string | null = null;

  constructor(root: HTMLElement, onDataChanged: () => void) {
    this.detailPanel = root.querySelector('#detail-panel')!;
    this.detailTitle = root.querySelector('#detail-title')!;
    this.detailBody = root.querySelector('#detail-body')!;
    this.detailDelete = root.querySelector('#detail-delete')!;
    this.deleteDialog = root.querySelector('#delete-dialog')!;
    this.deleteDialogText = root.querySelector('#delete-dialog-text')!;
    this.deleteDialogWarning = root.querySelector('#delete-dialog-warning')!;
    this.deleteCancel = root.querySelector('#delete-cancel')!;
    this.deleteConfirm = root.querySelector('#delete-confirm')!;
    this.onDataChanged = onDataChanged;

    this.detailPanel.querySelector('#detail-close')!.addEventListener('click', () => this.close());
    this.detailDelete.addEventListener('click', () => this.showDeleteDialog());
    this.deleteCancel.addEventListener('click', () => this.hideDeleteDialog());
    this.deleteConfirm.addEventListener('click', () => this.confirmDelete());
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  isOpen(): boolean {
    return this.detailPanel.classList.contains('open');
  }

  isDeleteDialogOpen(): boolean {
    return this.deleteDialog.classList.contains('visible');
  }

  close() {
    this.detailPanel.classList.remove('open');
    this.selectedId = null;
  }

  hideDeleteDialog() {
    this.deleteDialog.classList.remove('visible');
  }

  async showEntity(id: string) {
    this.selectedId = id;
    const data = await brainGetEntity(id);
    if (!data) return;
    const { entity: e, relations, events } = data;

    this.detailTitle.textContent = e.name as string;
    this.detailDelete.dataset['table'] = 'entities';
    this.detailDelete.dataset['id'] = e.id as string;
    this.detailDelete.dataset['name'] = e.name as string;

    let html = `<div class="brain-detail-section">
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailName')}</div>
        <input class="brain-detail-value editable" id="edit-name" value="${escHtml(e.name)}" />
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailType')}</div>
        <span class="type-badge type-${escHtml(e.type)}">${escHtml(e.type)}</span>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailSummary')}</div>
        <textarea class="brain-detail-value editable" id="edit-summary" rows="3">${escHtml(e.summary || '')}</textarea>
      </div>`;

    const props = parseJson(e.properties);
    if (props && Object.keys(props).length > 0) {
      html += `<div class="brain-detail-field"><div class="brain-detail-label">${t('brain.detailProperties')}</div>`;
      for (const [k, v] of Object.entries(props)) {
        html += `<div class="brain-detail-value" style="font-size:12px;margin-bottom:4px"><strong>${escHtml(k)}:</strong> ${escHtml(String(v))}</div>`;
      }
      html += '</div>';
    }

    html += `
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailImportance')}</div>
        <div class="brain-detail-value">${Math.round(((e.importance_score as number) ?? 0) * 100)}%</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailMentions')}</div>
        <div class="brain-detail-value">${(e.mention_count as number) ?? 0}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailFirstSeen')}</div>
        <div class="brain-detail-value ts">${formatTs(e.first_seen_at as string)}</div>
      </div>
    </div>`;

    if (relations.length > 0) {
      html += `<div class="brain-detail-section"><div class="brain-detail-section-title">${t('brain.detailRelations')}</div>`;
      for (const r of relations) {
        const isFrom = r.from_entity_id === e.id;
        const otherName = isFrom ? r.to_name || r.to_entity_id : r.from_name || r.from_entity_id;
        const otherId = isFrom ? r.to_entity_id : r.from_entity_id;
        const arrow = isFrom ? '\u2192' : '\u2190';
        html += `<div class="brain-relation-item" data-entity-id="${escHtml(otherId)}">
          ${arrow} <span class="brain-relation-type">${escHtml(r.type)}</span>
          <span class="brain-relation-name">${escHtml(otherName)}</span>
        </div>`;
      }
      html += '</div>';
    }

    if (events.length > 0) {
      html += `<div class="brain-detail-section"><div class="brain-detail-section-title">${t('brain.recentEvents')}</div>`;
      for (const ev of events) {
        const parsed = parseJson(ev.parsed_data);
        const text = parsed?.summary || parsed?.title || ev.event_type;
        html += `<div class="brain-event-item">
          <span class="brain-event-time">${formatTs(ev.timestamp as string)}</span>
          <span class="brain-event-text">${escHtml(truncate(String(text), 60))}</span>
        </div>`;
      }
      html += '</div>';
    }

    this.detailBody.innerHTML = html;
    this.open();

    const editName = this.detailBody.querySelector('#edit-name') as HTMLInputElement;
    const editSummary = this.detailBody.querySelector('#edit-summary') as HTMLTextAreaElement;
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    const saveEntity = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        await brainUpdateEntity(e.id as string, {
          name: editName.value.trim() || e.name,
          summary: editSummary.value.trim() || null,
        });
        this.detailTitle.textContent = editName.value.trim() || (e.name as string);
        this.onDataChanged();
      }, 500);
    };

    editName.addEventListener('input', saveEntity);
    editSummary.addEventListener('input', saveEntity);

    this.detailBody.querySelectorAll('.brain-relation-item').forEach((item) => {
      item.addEventListener('click', () => {
        const eid = (item as HTMLElement).dataset['entityId'];
        if (eid) this.showEntity(eid);
      });
    });
  }

  async showConversation(conv: Record<string, unknown>) {
    this.selectedId = conv.id as string;
    const platName = conv.platform
      ? (conv.platform as string).charAt(0).toUpperCase() + (conv.platform as string).slice(1)
      : '';
    this.detailTitle.textContent = `${platName} conversation`;
    this.detailDelete.dataset['table'] = 'agent_conversations';
    this.detailDelete.dataset['id'] = conv.id as string;
    this.detailDelete.dataset['name'] = `${platName} conversation`;

    const result = await brainGetConversation(conv.id as string, { offset: 0, limit: 100 });
    let html = `<div class="brain-detail-section">
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailPlatform')}</div>
        <div class="brain-detail-value">${escHtml(platName)}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailMessages')}</div>
        <div class="brain-detail-value">${(conv.message_count as number) ?? 0}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">${t('brain.detailLastMessage')}</div>
        <div class="brain-detail-value ts">${formatTs(conv.last_message_at as string)}</div>
      </div>
    </div>`;

    if (result.rows.length > 0) {
      html += `<div class="brain-detail-section"><div class="brain-detail-section-title">${t('brain.messagesSection')}</div>`;
      for (const m of result.rows) {
        const isCeo = m.sender_is_ceo === 1;
        html += `<div class="brain-message">
          <div class="brain-message-header">
            <span class="brain-message-sender ${isCeo ? 'is-ceo' : ''}">${escHtml(m.sender_id)}</span>
            <span class="brain-message-time">${formatTs(m.created_at as string)}</span>
          </div>
          <div class="brain-message-content">${escHtml(m.content)}</div>
        </div>`;
      }
      html += '</div>';
    }

    this.detailBody.innerHTML = html;
    this.open();
  }

  showGeneric(row: Record<string, unknown>, tableName: string) {
    this.selectedId = row.id as string;
    this.detailDelete.dataset['table'] = tableName;
    this.detailDelete.dataset['id'] = row.id as string;

    let title = '';
    let html = '<div class="brain-detail-section">';

    for (const [key, val] of Object.entries(row)) {
      if (key === 'id') continue;
      const displayKey = toTitleCase(key);
      let displayVal: unknown = val;

      if (typeof val === 'string' && val.length > 200) {
        displayVal = val;
        title = title || truncate(val, 40);
      } else if (typeof val === 'object' && val !== null) {
        displayVal = JSON.stringify(val, null, 2);
      }

      if (!title && (key === 'name' || key === 'content' || key === 'fact' || key === 'type')) {
        title = truncate(String(val), 40);
      }

      html += `<div class="brain-detail-field">
        <div class="brain-detail-label">${escHtml(displayKey)}</div>
        <div class="brain-detail-value" style="white-space:pre-wrap;word-break:break-word;user-select:text">${escHtml(String(displayVal ?? '-'))}</div>
      </div>`;
    }

    html += '</div>';
    this.detailTitle.textContent = title || (row.id as string);
    this.detailDelete.dataset['name'] = title || (row.id as string);
    this.detailBody.innerHTML = html;
    this.open();
  }

  private open() {
    this.detailPanel.classList.add('open');
  }

  private showDeleteDialog() {
    const table = this.detailDelete.dataset['table'];
    const name = this.detailDelete.dataset['name'] || this.detailDelete.dataset['id'];

    this.deleteDialogText.innerHTML = `Delete <span class="brain-dialog-name">${escHtml(name)}</span>?`;
    this.deleteDialogWarning.textContent =
      table === 'entities'
        ? t('brain.deleteEntityWarn')
        : table === 'agent_conversations'
          ? t('brain.deleteConvoWarn')
          : '';

    this.deleteDialog.classList.add('visible');
    this.deleteConfirm.dataset['table'] = table;
    this.deleteConfirm.dataset['id'] = this.detailDelete.dataset['id'];
  }

  private async confirmDelete() {
    const table = this.deleteConfirm.dataset['table']!;
    const id = this.deleteConfirm.dataset['id']!;
    this.deleteDialog.classList.remove('visible');

    await brainDelete(table, id);
    this.close();
    this.onDataChanged();
  }
}
