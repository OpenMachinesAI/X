import tkinter as tk
from tkinter import messagebox
import subprocess
import os
import sys
import tempfile
import logging
import shutil
import winsound
import psutil  # Ensure this is installed

# ============================
# Configuration Variables
# ============================

# Path to Google Chrome executable on Windows
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"  # Update if Chrome is installed elsewhere

# Path to the startup sound file (ensure this file exists)
# Place 'startup_sound.wav' in the same directory as this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STARTUP_SOUND_PATH = os.path.join(SCRIPT_DIR, "startup_sound.wav")

# Log file path
LOG_FILE_PATH = os.path.join(SCRIPT_DIR, "cbit_launcher.log")

# URL to open when "Applications" button is clicked
APPLICATIONS_URL = "https://sites.google.com/view/alexrose1/apps"

# ============================
# Logging Configuration
# ============================

logging.basicConfig(
    filename=LOG_FILE_PATH,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# ============================
# Sound Playback Function
# ============================

def play_startup_sound():
    if os.path.exists(STARTUP_SOUND_PATH):
        try:
            winsound.PlaySound(STARTUP_SOUND_PATH, winsound.SND_FILENAME | winsound.SND_ASYNC)
            logging.info("Startup sound played successfully.")
        except Exception as e:
            logging.error(f"Failed to play startup sound: {e}")
    else:
        logging.warning(f"Startup sound file not found at {STARTUP_SOUND_PATH}.")

# ============================
# Chrome Control Functions
# ============================

def kill_chrome_processes():
    """
    Terminates all running instances of Google Chrome.
    """
    try:
        logging.info("Attempting to terminate existing Chrome processes.")
        for proc in psutil.process_iter(['name']):
            if proc.info['name'] and proc.info['name'].lower() == 'chrome.exe':
                proc.terminate()
                proc.wait(timeout=5)
                logging.info(f"Terminated Chrome process with PID {proc.pid}.")
    except Exception as e:
        logging.error(f"Error terminating Chrome processes: {e}")

def open_chrome_sign_in():
    """
    Opens Google Chrome in fullscreen mode directed to the sign-in page without loading existing profiles.
    """
    try:
        if not os.path.exists(CHROME_PATH):
            raise FileNotFoundError(f"Chrome not found at {CHROME_PATH}")

        # Kill existing Chrome processes to prevent flag conflicts
        kill_chrome_processes()

        # Create a temporary directory for user data to prevent loading existing profiles
        temp_dir = tempfile.mkdtemp(prefix="cbit_chrome_")
        logging.info(f"Temporary user data directory created at {temp_dir}")

        # Launch Chrome with specified flags
        subprocess.Popen([
            CHROME_PATH,
            "--new-window",
            "--start-fullscreen",
            "--user-data-dir=" + temp_dir,
            "--no-default-browser-check",
            "--no-first-run",
            "https://accounts.google.com/AccountChooser?service=chromiumsync&hl=en-GB"
        ])
        logging.info("Chrome launched for Sign In without existing profiles.")
    except FileNotFoundError as e:
        logging.error(str(e))
        messagebox.showerror("Error", str(e))
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        messagebox.showerror("Error", f"An unexpected error occurred: {e}")

def open_chrome_guest():
    """
    Opens Google Chrome in guest mode and fullscreen, navigating to Google.com.
    """
    try:
        if not os.path.exists(CHROME_PATH):
            raise FileNotFoundError(f"Chrome not found at {CHROME_PATH}")

        # Kill existing Chrome processes to prevent flag conflicts
        kill_chrome_processes()

        # Launch Chrome in guest mode
        subprocess.Popen([
            CHROME_PATH,
            "--new-window",
            "--start-fullscreen",
            "--guest",
            "https://google.com"
        ])
        logging.info("Chrome launched in Guest Mode.")
    except FileNotFoundError as e:
        logging.error(str(e))
        messagebox.showerror("Error", str(e))
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        messagebox.showerror("Error", f"An unexpected error occurred: {e}")

def open_applications():
    """
    Opens Google Chrome in fullscreen mode directed to the specified Applications URL without loading existing profiles.
    """
    try:
        if not os.path.exists(CHROME_PATH):
            raise FileNotFoundError(f"Chrome not found at {CHROME_PATH}")

        # Kill existing Chrome processes to prevent flag conflicts
        kill_chrome_processes()

        # Create a temporary directory for user data to prevent loading existing profiles
        temp_dir = tempfile.mkdtemp(prefix="cbit_chrome_apps_")
        logging.info(f"Temporary user data directory created at {temp_dir}")

        # Launch Chrome with specified flags and navigate to the Applications URL
        subprocess.Popen([
            CHROME_PATH,
            "--new-window",
            "--start-fullscreen",
            "--user-data-dir=" + temp_dir,
            "--no-default-browser-check",
            "--no-first-run",
            APPLICATIONS_URL
        ])
        logging.info(f"Chrome launched for Applications at {APPLICATIONS_URL} without existing profiles.")
    except FileNotFoundError as e:
        logging.error(str(e))
        messagebox.showerror("Error", str(e))
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        messagebox.showerror("Error", f"An unexpected error occurred: {e}")

def open_specific_application():
    """
    (Optional) Opens a specific application or file. Currently unused.
    """
    try:
        # Example: Open Notepad
        application_path = "C:\\Windows\\System32\\notepad.exe"
        if os.path.exists(application_path):
            subprocess.Popen([application_path])
            logging.info(f"Opened application at {application_path}.")
        else:
            raise FileNotFoundError(f"Application not found at {application_path}")
    except FileNotFoundError as e:
        logging.error(str(e))
        messagebox.showerror("Error", str(e))
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        messagebox.showerror("Error", f"An unexpected error occurred: {e}")

def exit_app():
    """
    Exits the CBIT Launcher application.
    """
    logging.info("Exiting CBIT Launcher.")
    sys.exit()

# ============================
# GUI Setup Function
# ============================

def create_gui():
    # Play the startup sound
    play_startup_sound()

    # Initialize the main window
    root = tk.Tk()
    root.title("CBIT Launcher")
    root.attributes("-fullscreen", True)
    root.configure(bg="#2E3440")  # Dark background color

    # Create a top frame for the title
    top_frame = tk.Frame(root, bg="#2E3440")
    top_frame.pack(pady=50)

    # CBIT Title
    title_label = tk.Label(
        top_frame, 
        text="CBIT", 
        font=("Helvetica", 48, "bold"), 
        bg="#2E3440", 
        fg="#D8DEE9"
    )
    title_label.pack()

    # Create a middle frame for the buttons
    middle_frame = tk.Frame(root, bg="#2E3440")
    middle_frame.pack(pady=50)

    # Define button style
    button_style = {
        "font": ("Helvetica", 24),
        "width": 25,
        "height": 2,
        "bg": "#88C0D0",
        "fg": "#2E3440",
        "activebackground": "#81A1C1",
        "activeforeground": "#ECEFF4",
        "borderwidth": 0,
        "highlightthickness": 0
    }

    # Sign In to Chrome Button
    sign_in_button = tk.Button(
        middle_frame, 
        text="Sign In to Chrome", 
        command=open_chrome_sign_in,
        **button_style
    )
    sign_in_button.pack(pady=10)

    # Chrome (Guest Mode) Button
    guest_button = tk.Button(
        middle_frame, 
        text="Chrome (Guest Mode)", 
        command=open_chrome_guest,
        **button_style
    )
    guest_button.pack(pady=10)

    # Applications Button (Opens Chrome at specific URL)
    apps_button = tk.Button(
        middle_frame, 
        text="Applications", 
        command=open_applications,
        **button_style
    )
    apps_button.pack(pady=10)

    # Exit Button
    exit_button = tk.Button(
        root, 
        text="Exit", 
        command=exit_app,
        font=("Helvetica", 18),
        bg="#BF616A",
        fg="#2E3440",
        activebackground="#D08770",
        activeforeground="#ECEFF4",
        borderwidth=0,
        highlightthickness=0
    )
    exit_button.pack(pady=20)

    # Bind the Escape key to exit the application
    root.bind("<Escape>", lambda event: exit_app())

    # Start the Tkinter main loop
    root.mainloop()

# ============================
# Main Execution
# ============================

if __name__ == "__main__":
    # Check if psutil is installed
    try:
        import psutil
    except ImportError:
        messagebox.showerror("Missing Dependency", "The 'psutil' library is required.\nPlease install it using 'pip install psutil'.")
        sys.exit(1)
    
    create_gui()
