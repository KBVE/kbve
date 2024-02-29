"use client";
 
//import Image from "next/image";
import { Tabs } from "./tabs";
 
export function TabsDemo() {
  const tabs = [
    {
      title: "Search",
      value: "search",
      content: (
        <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-cyan-700 to-violet-900">
          <p>Search</p>
          <DummyContent />
        </div>
      ),
    },
    {
      title: "Services",
      value: "services",
      content: (
        <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-cyan-700 to-violet-900">
          <p>Services</p>
          <DummyContent />
        </div>
      ),
    },
    {
      title: "PG",
      value: "playground",
      content: (
        <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-cyan-700 to-violet-900">
          <p>Playground</p>
          <DummyContent />
        </div>
      ),
    },
    {
        title: "Content",
        value: "content",
        content: (
          <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
            <p>Content tab</p>
            <DummyContent />
          </div>
        ),
      },
  ];
 
  return (
    <div className="h-[20rem] md:h-[40rem] [perspective:1000px] relative b flex flex-col max-w-5xl mx-auto w-full  items-start justify-start my-40">
      <Tabs tabs={tabs} />
    </div>
  );
}
 
const DummyContent = () => {
  return (
    <img
      src="https://images.unsplash.com/photo-1707391464182-dda2c341ba74?q=80&w=2572&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
      alt="dummy image"
      width="1000"
      height="1000"
      className="object-cover object-left-top h-[60%]  md:h-[90%] absolute my-2 md:-bottom-10 inset-x-0 w-[90%] rounded-xl mx-auto"
    />
  );
};