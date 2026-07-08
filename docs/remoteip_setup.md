# Connecting a Remote MySQL Server for Backup

This guide walks through preparing a remote MySQL server so the Backup Monitoring System can
connect to it and run `mysqldump` against it. Replace every placeholder below (`<...>`) with your
own real values — nothing here should be copied in literally.

---

## 1. Create a dedicated backup user on the remote server

On the **remote** MySQL server (the one being backed up), run:

```sql
CREATE USER 'backup_user'@'%' IDENTIFIED BY '<choose-a-strong-password>';
GRANT SELECT, SHOW VIEW, LOCK TABLES, EVENT, TRIGGER ON *.* TO 'backup_user'@'%';
FLUSH PRIVILEGES;
```

> Example only — do not use this password anywhere real:
> `IDENTIFIED BY 'Test@123'`
>
> `'%'` allows this user to connect from any host. If you know the fixed IP of the machine running
> BMS, scope it down instead, e.g. `'backup_user'@'10.0.0.25'`, for tighter security.

## 2. Allow remote connections on that server

Check whether MySQL is currently listening only on localhost:

```sql
SHOW VARIABLES LIKE 'bind_address';
```

If it's restricted to `127.0.0.1`, update the MySQL config file (`my.ini` / `my.cnf`):

```ini
bind-address = 0.0.0.0
```

Restart the MySQL service after making this change.

## 3. Open the firewall port

Allow inbound TCP traffic on port `3306` (or whatever port that MySQL instance uses).

**Windows Firewall:** Advanced Settings → Inbound Rules → New Rule → Port → TCP → `3306` → Allow.

## 4. Verify connectivity from the BMS machine

```bash
ping <remote-server-ip>
mysql -h <remote-server-ip> -P 3306 -u backup_user -p
```

A successful login confirms the remote server is reachable and the credentials work.

## 5. Register the instance in BMS

Go to **Add New Instance** and fill in:

| Field | Value |
|---|---|
| Instance Name | Any label you'll recognize, e.g. `CRM-DB` |
| Database Type | `MySQL` |
| IP Address | `<remote-server-ip>` |
| Port Number | `3306` |
| Username | `backup_user` |
| Password | the password you set in step 1 |

Click **Check Connection** to confirm before saving.

## 6. Run a backup

Click **Backup Now**, or set up a schedule from the Dashboard. The system will:

1. Connect to the remote MySQL server using the stored credentials.
2. Run `mysqldump` against every non-system database on that server.
3. Save the resulting `.sql` file to the backup folder you chose.
4. Record the outcome (duration, file size, status) in **Backup History**.

---

## Common errors

| Error | Cause |
|---|---|
| `Host '<client-host>' is not allowed to connect` | The MySQL user doesn't have remote-access permissions — recheck step 1. |
| `Access denied for user` | Incorrect username or password. |
| `Can't connect to MySQL server` | Firewall restrictions, network issues, wrong IP, or MySQL isn't accepting remote connections — recheck steps 2–3. |
