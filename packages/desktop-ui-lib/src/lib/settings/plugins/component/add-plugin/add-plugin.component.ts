import { Component, inject, NgZone, OnInit } from '@angular/core';
import { distinctUntilChange } from '@gauzy/ui-core/common';
import { NbDialogRef } from '@nebular/theme';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { tap } from 'rxjs';
import { PluginElectronService } from '../../services/plugin-electron.service';

@UntilDestroy({ checkProperties: true })
@Component({
	selector: 'ngx-add-plugin',
	templateUrl: './add-plugin.component.html',
	styleUrls: ['./add-plugin.component.scss']
})
export class AddPluginComponent implements OnInit {
	private readonly pluginElectronService = inject(PluginElectronService);
	private readonly dialogRef = inject(NbDialogRef<AddPluginComponent>);
	private readonly ngZone = inject(NgZone);
	public installing = false;
	public error = '';

	ngOnInit(): void {
		this.pluginElectronService.status
			.pipe(
				distinctUntilChange(),
				tap(({ status, message }) =>
					this.ngZone.run(() => {
						this.handleStatus({ status, message });
					})
				),
				untilDestroyed(this)
			)
			.subscribe();
	}

	private handleStatus(notification: { status: string; message?: string }) {
		switch (notification.status) {
			case 'success':
				this.installing = false;
				this.close();
				break;
			case 'error':
				this.installing = false;
				this.error = notification.message;
				break;
			case 'inProgress':
				this.installing = true;
				break;
			default:
				this.installing = false;
				break;
		}
	}

	public installPlugin(value: string) {
		if (!value) {
			this.error = "The server URL mustn't be empty.";
			return;
		}
		this.installing = true;
		this.pluginElectronService.downloadAndInstall({ url: value.trim() });
	}

	public close() {
		this.dialogRef.close();
	}
}
