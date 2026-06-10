"use client";

import { useRouter } from "next/navigation";

interface Props {
  users: { id: number; name: string; role: string }[];
  currentId: number;
}

export default function UserSwitcher({ users, currentId }: Props) {
  const router = useRouter();
  return (
    <select
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
      value={currentId}
      onChange={(e) => {
        document.cookie = `hrcore_user=${e.target.value}; path=/; max-age=2592000`;
        router.refresh();
      }}
      title="Demo: switch user"
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.role})
        </option>
      ))}
    </select>
  );
}
