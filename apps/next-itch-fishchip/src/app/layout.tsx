import './global.css';
import { StyledComponentsRegistry } from './registry';

export const metadata = {
  title: 'Fish&Chip - A Mini RPG Fishing Game',
  description: 'This game was created for a mini game jam!',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <StyledComponentsRegistry>{children}</StyledComponentsRegistry>
      </body>
    </html>
  );
}
