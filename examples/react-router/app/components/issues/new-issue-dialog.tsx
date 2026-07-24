import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
  getPerson,
  IssuePriorities,
  PersonIds,
  PriorityLabels,
  type IssuePriority,
  type NewIssueInput,
  type PersonId,
} from "~/features/issues/model";
import { PlusIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { PersonAvatar, Priority } from "./issue-metadata";

const PriorityItems = IssuePriorities.map((value) => ({
  label: PriorityLabels[value].en,
  value,
}));

const AssigneeItems = PersonIds.map((value) => ({
  label: getPerson(value).name,
  value,
}));

export const NewIssueDialog = ({
  compact = false,
  onCreate,
  triggerClassName,
}: {
  readonly compact?: boolean;
  readonly onCreate: (input: NewIssueInput) => void;
  readonly triggerClassName?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [assignee, setAssignee] = useState<PersonId>("maya");
  const [error, setError] = useState<string>();

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssignee("maya");
    setError(undefined);
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
      open={open}
    >
      <DialogTrigger render={<Button className={triggerClassName} size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        {compact ? <span className="sr-only">New issue</span> : "New issue"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SparklesIcon aria-hidden="true" />
          </div>
          <DialogTitle>Create a local issue</DialogTitle>
          <DialogDescription>
            Add a deterministic issue to this demo. No server or model call is
            made.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-issue-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim().length === 0) {
              setError("Add a short title before you create the issue.");
              return;
            }

            onCreate({ assignee, description, priority, title });
            setOpen(false);
            reset();
          }}
        >
          <FieldGroup>
            <Field data-invalid={error ? "true" : undefined}>
              <FieldLabel htmlFor="new-issue-title">Title</FieldLabel>
              <Input
                aria-invalid={Boolean(error)}
                autoFocus
                id="new-issue-title"
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  if (error) setError(undefined);
                }}
                placeholder="What should the agent verify?"
                value={title}
              />
              <FieldError>{error}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-issue-description">
                Description
              </FieldLabel>
              <Textarea
                id="new-issue-description"
                onChange={(event) => setDescription(event.currentTarget.value)}
                placeholder="Add the expected result and useful context."
                rows={4}
                value={description}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldTitle>Priority</FieldTitle>
                <Select
                  items={PriorityItems}
                  onValueChange={(value) => {
                    if (value) setPriority(value);
                  }}
                  value={priority}
                >
                  <SelectTrigger aria-label="Issue priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {IssuePriorities.map((value) => (
                        <SelectItem key={value} value={value}>
                          <Priority priority={value} />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldTitle>Assignee</FieldTitle>
                <Select
                  items={AssigneeItems}
                  onValueChange={(value) => {
                    if (value) setAssignee(value);
                  }}
                  value={assignee}
                >
                  <SelectTrigger aria-label="Issue assignee" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {PersonIds.map((value) => (
                        <SelectItem key={value} value={value}>
                          <PersonAvatar id={value} showName />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button form="new-issue-form" type="submit">
            Create issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
