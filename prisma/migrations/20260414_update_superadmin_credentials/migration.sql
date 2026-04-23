-- Actualizar email y contraseña del Super Administrador
UPDATE "User"
SET
  email        = 'alejandro.romero@microkapital.com',
  "passwordHash" = '$2a$12$hCIPg7gFbaBqo7VgBQ4GNefXGck71CCxEE3JZr3zxSGHR6RVh91MK'
WHERE rol = 'SUPER_ADMIN'
  AND email = 'admin@microkapital.com';
