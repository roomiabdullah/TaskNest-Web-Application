# Step 1: Use a lightweight web server (Nginx)
FROM nginx:alpine

# Step 2: Remove the default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Step 3: Copy YOUR project files into the container
# This takes everything from your current folder (.) and puts it in the server folder
COPY . /usr/share/nginx/html

# Step 4: Expose port 80 (Standard web port)
EXPOSE 80

# Step 5: Start the server
CMD ["nginx", "-g", "daemon off;"]